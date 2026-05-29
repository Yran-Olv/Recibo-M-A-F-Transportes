import express from "express";
import path from "path";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import {
  initDb,
  getCompanyProfile,
  getCompanies,
  getCompanyById,
  saveCompanyProfile,
  deleteCompanyProfile,
  getSenders,
  addSender,
  updateSender,
  getRecipients,
  addRecipient,
  updateRecipient,
  getDrivers,
  addDriver,
  updateDriver,
  saveDriverWithVehicle,
  getVehicles,
  addVehicle,
  updateVehicle,
  getReceipts,
  getNextReceiptNumber,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  deleteSender,
  deleteRecipient,
  deleteDriver,
  deleteVehicle,
  getFaturas,
  addFatura,
  updateFatura,
  deleteFatura,
  getAgentes,
  addAgente,
  updateAgente,
  deleteAgente,
  getSessionStore,
  isUsingPostgres,
} from "./src/server/db.ts";
import { createAuthMiddleware, registerAuthRoutes } from "./src/server/auth.ts";
import { lookupCnpj } from "./src/server/cnpjLookup.ts";
import { lookupCep } from "./src/server/cepLookup.ts";
import { onlyDigits } from "./src/utils/cnpj.ts";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const HOST =
    process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    console.error("Defina SESSION_SECRET no ambiente de produção.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === "production",
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  app.use(cookieParser(sessionSecret || "maf-recibo-dev-secret-change-me"));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde alguns minutos." },
  });
  app.use("/api/auth/login", authLimiter);

  const cnpjLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Limite de consultas de CNPJ. Aguarde um minuto." },
  });

  try {
    await initDb();
    const pg = isUsingPostgres();
    console.log(pg ? "Banco: PostgreSQL ativo." : "Banco: modo JSON local (db.json). Configure PGHOST no .env para PostgreSQL.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }

  const sessionStore = getSessionStore();
  const requireAuth = createAuthMiddleware(sessionStore);

  registerAuthRoutes(app, sessionStore, requireAuth);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      database: isUsingPostgres() ? "postgresql" : "json",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  app.get("/api/companies", async (_req, res) => {
    try {
      res.json(await getCompanies());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await getCompanyById(parseInt(req.params.id, 10));
      if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
      res.json(company);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/company", async (_req, res) => {
    try {
      res.json(await getCompanyProfile());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/company", async (req, res) => {
    try {
      const body = req.body as { id?: number };
      const saved = await saveCompanyProfile(req.body, {
        create: body.id == null || Number(body.id) <= 0,
      });
      res.json({ success: true, company: saved });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  /** Sempre cadastra uma nova empresa (não sobrescreve a existente). */
  app.post("/api/companies", async (req, res) => {
    try {
      const saved = await saveCompanyProfile(req.body, { create: true });
      res.json({ success: true, company: saved });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const ok = await deleteCompanyProfile(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/cep/:cep", cnpjLimiter, async (req, res) => {
    try {
      const data = await lookupCep(req.params.cep);
      res.json(data);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : "CEP inválido" });
    }
  });

  app.get("/api/cnpj/:cnpj", cnpjLimiter, async (req, res) => {
    try {
      const digits = onlyDigits(req.params.cnpj);
      if (digits.length !== 14) {
        return res.status(400).json({ error: "Informe um CNPJ com 14 dígitos" });
      }
      const data = await lookupCnpj(digits);
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro na consulta";
      const status = msg.includes("não encontrado") ? 404 : 502;
      res.status(status).json({ error: msg });
    }
  });

  app.get("/api/catalog/senders", async (req, res) => {
    try {
      res.json(await getSenders());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/catalog/senders", async (req, res) => {
    try {
      res.json(await addSender(req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/catalog/senders/:id", async (req, res) => {
    try {
      res.json(await updateSender(parseInt(req.params.id, 10), req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/catalog/recipients", async (req, res) => {
    try {
      res.json(await getRecipients());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/catalog/recipients", async (req, res) => {
    try {
      res.json(await addRecipient(req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/catalog/recipients/:id", async (req, res) => {
    try {
      res.json(await updateRecipient(parseInt(req.params.id, 10), req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/catalog/drivers", async (req, res) => {
    try {
      res.json(await getDrivers());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/catalog/drivers", async (req, res) => {
    try {
      const body = req.body as { vehicle_link?: string };
      const saved =
        body?.vehicle_link != null
          ? await saveDriverWithVehicle(body as Parameters<typeof saveDriverWithVehicle>[0])
          : await addDriver(req.body);
      res.json(saved);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/catalog/drivers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const body = req.body as Parameters<typeof saveDriverWithVehicle>[0];
      const saved = await updateDriver(id, { ...body, id });
      res.json(saved);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/catalog/vehicles", async (req, res) => {
    try {
      res.json(await getVehicles());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/catalog/vehicles", async (req, res) => {
    try {
      res.json(await addVehicle(req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/catalog/vehicles/:id", async (req, res) => {
    try {
      res.json(await updateVehicle(parseInt(req.params.id, 10), req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/catalog/faturas", async (_req, res) => {
    try {
      res.json(await getFaturas());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/catalog/faturas", async (req, res) => {
    try {
      res.json(await addFatura(req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/catalog/faturas/:id", async (req, res) => {
    try {
      res.json(await updateFatura(parseInt(req.params.id, 10), req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/catalog/agentes", async (_req, res) => {
    try {
      res.json(await getAgentes());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/catalog/agentes", async (req, res) => {
    try {
      res.json(await addAgente(req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.put("/api/catalog/agentes/:id", async (req, res) => {
    try {
      res.json(await updateAgente(parseInt(req.params.id, 10), req.body));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/catalog/senders/:id", async (req, res) => {
    try {
      const ok = await deleteSender(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/catalog/recipients/:id", async (req, res) => {
    try {
      const ok = await deleteRecipient(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/catalog/drivers/:id", async (req, res) => {
    try {
      const ok = await deleteDriver(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/catalog/vehicles/:id", async (req, res) => {
    try {
      const ok = await deleteVehicle(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/catalog/faturas/:id", async (req, res) => {
    try {
      const ok = await deleteFatura(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.delete("/api/catalog/agentes/:id", async (req, res) => {
    try {
      const ok = await deleteAgente(parseInt(req.params.id, 10));
      res.json({ success: ok });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/receipts", async (req, res) => {
    try {
      res.json(await getReceipts());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.get("/api/receipts/next", async (req, res) => {
    try {
      res.json({ nextNumber: await getNextReceiptNumber() });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  app.post("/api/receipts", async (req, res) => {
    try {
      const saved = await createReceipt(req.body);
      res.json(saved);
    } catch (err: unknown) {
      console.error("Erro ao salvar espelho:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Não foi possível salvar o espelho no banco de dados.",
      });
    }
  });

  app.put("/api/receipts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID inválido." });
        return;
      }
      const saved = await updateReceipt(id, req.body);
      res.json(saved);
    } catch (err: unknown) {
      console.error("Erro ao atualizar espelho:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Não foi possível atualizar o espelho.",
      });
    }
  });

  app.delete("/api/receipts/:id", async (req, res) => {
    try {
      const deleted = await deleteReceipt(parseInt(req.params.id, 10));
      res.json({ success: deleted });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const disableWatch = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: disableWatch ? null : undefined,
        hmr: disableWatch ? false : undefined,
      },
      appType: "spa",
    });
    if (disableWatch) {
      console.log("Vite: modo sem file-watcher (evita erro ENOSPC no Linux).");
    }
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Servidor M.A.F Recibos: http://${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`);
  });
}

startServer();
