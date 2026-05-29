import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { runDailyBackupIfNeeded } from "./backup.ts";

export interface AuthUser {
  id: number;
  username: string;
  nome: string;
  role: string;
}

export interface SessionStore {
  createSession(userId: number): Promise<string>;
  getUserBySession(token: string): Promise<AuthUser | null>;
  deleteSession(token: string): Promise<void>;
  findUserByUsername(username: string): Promise<{
    id: number;
    username: string;
    password_hash: string;
    nome: string;
    role: string;
  } | null>;
  createUser(
    username: string,
    password: string,
    nome: string,
    role?: string
  ): Promise<AuthUser>;
  countUsers(): Promise<number>;
  updatePassword?(userId: number, passwordHash: string): Promise<void>;
}

const COOKIE_NAME = "maf_session";
const SESSION_DAYS = 7;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getTokenFromRequest(req: Request): string | null {
  const signed = req.signedCookies?.[COOKIE_NAME];
  if (typeof signed === "string" && signed.length > 0) return signed;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export function createAuthMiddleware(store: SessionStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    try {
      const user = await store.getUserBySession(token);
      if (!user) {
        res.clearCookie(COOKIE_NAME);
        res.status(401).json({ error: "Sessão expirada ou inválida." });
        return;
      }
      (req as Request & { user?: AuthUser }).user = user;
      next();
    } catch {
      res.status(500).json({ error: "Erro ao validar sessão." });
    }
  };
}

function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    signed: true,
    path: "/",
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function registerAuthRoutes(
  app: Express,
  store: SessionStore,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void
) {
  app.post("/api/auth/login", async (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      res.status(400).json({ error: "Usuário e senha são obrigatórios." });
      return;
    }

    if (password.length > 128) {
      res.status(400).json({ error: "Senha inválida." });
      return;
    }

    try {
      const user = await store.findUserByUsername(username);
      if (!user) {
        res.status(401).json({ error: "Usuário ou senha incorretos." });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Usuário ou senha incorretos." });
        return;
      }

      const token = await store.createSession(user.id);
      setSessionCookie(res, token);

      const backup = await runDailyBackupIfNeeded();

      res.json({
        user: {
          id: user.id,
          username: user.username,
          nome: user.nome,
          role: user.role,
        },
        backup: backup.ran
          ? { ok: true, path: backup.path }
          : backup.skipped
            ? { ok: true, skipped: true }
            : backup.error
              ? { ok: false, error: backup.error }
              : undefined,
      });
    } catch (err: unknown) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Erro interno ao autenticar." });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = getTokenFromRequest(req);
    if (token) {
      try {
        await store.deleteSession(token);
      } catch {
        /* ignore */
      }
    }
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    try {
      const user = await store.getUserBySession(token);
      if (!user) {
        clearSessionCookie(res);
        res.status(401).json({ error: "Sessão inválida." });
        return;
      }
      const backup = await runDailyBackupIfNeeded();
      res.json({
        user,
        backup: backup.ran ? { ok: true, path: backup.path } : undefined,
      });
    } catch {
      res.status(500).json({ error: "Erro ao obter usuário." });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const user = (req as Request & { user?: AuthUser }).user;

    if (!user) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres." });
      return;
    }

    if (newPassword.length > 128) {
      res.status(400).json({ error: "Senha muito longa." });
      return;
    }

    try {
      const dbUser = await store.findUserByUsername(user.username);
      if (!dbUser) {
        res.status(404).json({ error: "Usuário não encontrado." });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Senha atual incorreta." });
        return;
      }

      const hash = await bcrypt.hash(newPassword, 12);
      if (store.updatePassword) {
        await store.updatePassword(user.id, hash);
      }

      const token = getTokenFromRequest(req);
      if (token) await store.deleteSession(token);

      const newToken = await store.createSession(user.id);
      setSessionCookie(res, newToken);

      res.json({ success: true });
    } catch (err: unknown) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Erro ao alterar senha." });
    }
  });

  app.post("/api/auth/users", requireAuth, async (req, res) => {
    const admin = (req as Request & { user?: AuthUser }).user;
    if (!admin || admin.role !== "admin") {
      res.status(403).json({ error: "Apenas administradores podem criar usuários." });
      return;
    }

    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const nome = String(req.body?.nome || "").trim();

    if (!username || !password || !nome) {
      res.status(400).json({ error: "Preencha usuário, nome e senha." });
      return;
    }

    if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
      res.status(400).json({ error: "Usuário inválido (use letras, números, . _ -)." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres." });
      return;
    }

    try {
      const existing = await store.findUserByUsername(username);
      if (existing) {
        res.status(409).json({ error: "Usuário já existe." });
        return;
      }

      const created = await store.createUser(username, password, nome, "user");
      res.status(201).json({ user: created });
    } catch (err: unknown) {
      console.error("Create user error:", err);
      res.status(500).json({ error: "Erro ao criar usuário." });
    }
  });
}
