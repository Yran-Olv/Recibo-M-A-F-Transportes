import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { AuthUser, SessionStore } from "./auth.ts";
import { hashToken } from "./auth.ts";
import { clampPgDecimal, parseBrDecimal } from "../utils/brDecimal.ts";
import { normalizeCompanyProfile } from "../utils/companyAddress.ts";

const { Pool } = pg;

// Database file path for the fallback JSON storage
const JSON_DB_PATH = path.join(process.cwd(), "db.json");

// Default initial state for JSON database fallback
const DEFAULT_JSON_DB = {
  company_profile: {
    nome_empresa: "",
    nome_fantasia: "",
    cnpj: "",
    inscricao_estadual: "",
    endereco: "",
    endereco_logradouro: "",
    endereco_numero: "",
    endereco_complemento: "",
    endereco_bairro: "",
    endereco_cidade: "",
    endereco_estado: "",
    telefone: "",
    email: "",
    cep: "",
    logo_base64: "",
  },
  senders: [] as CatalogItem[],
  recipients: [] as CatalogItem[],
  drivers: [] as CatalogItem[],
  vehicles: [] as CatalogItem[],
  faturas: [] as CatalogItem[],
  agentes: [] as CatalogItem[],
  receipts: [] as Receipt[],
  users: [] as { id: number; username: string; password_hash: string; nome: string; role: string }[],
  sessions: [] as { id: number; user_id: number; token_hash: string; expires_at: string }[],
};

// Types & Interfaces
export interface CompanyProfile {
  nome_empresa: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_estadual: string;
  endereco: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  telefone: string;
  email?: string;
  cep?: string;
  logo_base64?: string;
}

export interface CatalogItem {
  id?: number;
  nome?: string;
  placa?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cnpj_cpf?: string;
  cpf?: string;
  telefone?: string;
  inscricao_estadual?: string;
  vehicle_id?: number | null;
  agente_id?: number | null;
  agente_nome?: string;
}

export interface DriverSavePayload {
  nome: string;
  cpf?: string;
  telefone?: string;
  vehicle_link: "new" | "existing" | "none";
  vehicle_id?: number;
  placa?: string;
  cidade?: string;
  estado?: string;
  agente_id?: number;
  id?: number;
}

export interface Receipt {
  id?: number;
  numero_recibo: string;
  data_recibo: string;
  has_qrcode?: boolean;
  has_signature?: boolean;
  is_blank?: boolean;
  
  // Sender
  remetente_nome: string;
  remetente_endereco: string;
  remetente_cidade: string;
  remetente_estado: string;
  remetente_cnpj_cpf: string;
  remetente_inscricao_estadual: string;
  
  // Recipient
  destinatario_nome: string;
  destinatario_endereco: string;
  destinatario_cidade: string;
  destinatario_estado: string;
  destinatario_cnpj_cpf: string;
  destinatario_inscricao_estadual: string;
  
  // Goods
  mercadoria_natureza: string;
  mercadoria_documento_fiscal?: string;
  mercadoria_nota_fiscal: string;
  mercadoria_valor: string | number;
  mercadoria_quantidade: string | number;
  mercadoria_peso?: string | number;
  mercadoria_unidade: string;
  
  // Values
  valor_seguro: string | number;
  valor_icms: string | number;
  valor_outros: string | number;
  valor_total_frete: string | number;
  observacoes: string;
  
  // Carrier
  motorista_nome: string;
  motorista_cpf: string;
  motorista_telefone: string;
  veiculo_placa: string;
  veiculo_cidade: string;
  veiculo_estado: string;
  fatura_nome?: string;
  agente_nome?: string;
  created_at?: string;
}

async function migrateSchema(client: pg.PoolClient) {
  const alters = [
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS cep VARCHAR(20)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS endereco_logradouro VARCHAR(255)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS endereco_numero VARCHAR(30)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS endereco_complemento VARCHAR(120)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS endereco_bairro VARCHAR(120)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS endereco_cidade VARCHAR(120)`,
    `ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS endereco_estado CHAR(2)`,
    `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS mercadoria_documento_fiscal VARCHAR(100)`,
    `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS mercadoria_peso DECIMAL(12,3)`,
    `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS fatura_nome VARCHAR(255)`,
    `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS agente_nome VARCHAR(255)`,
    `ALTER TABLE receipts ALTER COLUMN mercadoria_valor TYPE DECIMAL(15,2)`,
    `ALTER TABLE receipts ALTER COLUMN mercadoria_quantidade TYPE DECIMAL(15,3)`,
    `ALTER TABLE receipts ALTER COLUMN mercadoria_peso TYPE DECIMAL(15,3)`,
    `ALTER TABLE receipts ALTER COLUMN valor_seguro TYPE DECIMAL(15,2)`,
    `ALTER TABLE receipts ALTER COLUMN valor_icms TYPE DECIMAL(15,2)`,
    `ALTER TABLE receipts ALTER COLUMN valor_outros TYPE DECIMAL(15,2)`,
    `ALTER TABLE receipts ALTER COLUMN valor_total_frete TYPE DECIMAL(15,2)`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL`,
    `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS agente_id INTEGER REFERENCES agentes(id) ON DELETE SET NULL`,
    `CREATE TABLE IF NOT EXISTS faturas (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) UNIQUE NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agentes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) UNIQUE NOT NULL
    )`,
  ];
  for (const sql of alters) {
    await client.query(sql);
  }
}

// Check database connection configuration
const hasPostgresEnv = !!(
  process.env.DATABASE_URL ||
  (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE)
);

let pool: pg.Pool | null = null;
let isPostgresActive = false;

// Initialize connection safely
try {
  if (hasPostgresEnv) {
    console.log("PostgreSQL environment detected. Attempting to connect...");
    const config: pg.PoolConfig = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false } }
      : {
          host: process.env.PGHOST,
          port: parseInt(process.env.PGPORT || "5432"),
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
        };
        
    pool = new Pool(config);
    console.log("PostgreSQL pool criado — conexão será validada no initDb().");
  }
} catch (error) {
  console.error("Failed to initialize PostgreSQL pool, falling back to JSON storage:", error);
  isPostgresActive = false;
  pool = null;
}

// JSON db functions helper
function readJsonDb(): typeof DEFAULT_JSON_DB {
  try {
    if (!fs.existsSync(JSON_DB_PATH)) {
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(DEFAULT_JSON_DB, null, 2), "utf8");
      return DEFAULT_JSON_DB;
    }
    const data = fs.readFileSync(JSON_DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading JSON database file:", error);
    return DEFAULT_JSON_DB;
  }
}

function writeJsonDb(data: any) {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing JSON database file:", error);
  }
}

// Database initialization (e.g. Ensure tables exist in Postgres)
export async function initDb() {
  if (pool && hasPostgresEnv) {
    try {
      await pool.query("SELECT 1");
      isPostgresActive = true;
      const client = await pool.connect();
      try {
        console.log("PostgreSQL conectado. Criando/verificando tabelas...");
        // Auto-create company_profile
        await client.query(`
          CREATE TABLE IF NOT EXISTS company_profile (
            id SERIAL PRIMARY KEY,
            nome_empresa VARCHAR(255) NOT NULL,
            nome_fantasia VARCHAR(255),
            cnpj VARCHAR(50) NOT NULL,
            inscricao_estadual VARCHAR(50),
            endereco TEXT NOT NULL,
            telefone VARCHAR(50),
            email VARCHAR(255),
            cep VARCHAR(20),
            logo_base64 TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        // Auto-create senders
        await client.query(`
          CREATE TABLE IF NOT EXISTS senders (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) UNIQUE NOT NULL,
            endereco TEXT,
            cidade VARCHAR(100),
            estado VARCHAR(50),
            cnpj_cpf VARCHAR(50),
            inscricao_estadual VARCHAR(50)
          )
        `);
        // Auto-create recipients
        await client.query(`
          CREATE TABLE IF NOT EXISTS recipients (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) UNIQUE NOT NULL,
            endereco TEXT,
            cidade VARCHAR(100),
            estado VARCHAR(50),
            cnpj_cpf VARCHAR(50),
            inscricao_estadual VARCHAR(50)
          )
        `);
        // Auto-create drivers
        await client.query(`
          CREATE TABLE IF NOT EXISTS drivers (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) UNIQUE NOT NULL,
            cpf VARCHAR(50),
            telefone VARCHAR(50)
          )
        `);
        // Auto-create vehicles
        await client.query(`
          CREATE TABLE IF NOT EXISTS vehicles (
            id SERIAL PRIMARY KEY,
            placa VARCHAR(50) UNIQUE NOT NULL,
            cidade VARCHAR(100),
            estado VARCHAR(50)
          )
        `);
        // Auto-create receipts
        await client.query(`
          CREATE TABLE IF NOT EXISTS receipts (
            id SERIAL PRIMARY KEY,
            numero_recibo VARCHAR(50) UNIQUE NOT NULL,
            data_recibo DATE NOT NULL,
            has_qrcode BOOLEAN DEFAULT FALSE,
            has_signature BOOLEAN DEFAULT FALSE,
            is_blank BOOLEAN DEFAULT FALSE,
            remetente_nome VARCHAR(255),
            remetente_endereco TEXT,
            remetente_cidade VARCHAR(100),
            remetente_estado VARCHAR(50),
            remetente_cnpj_cpf VARCHAR(50),
            remetente_inscricao_estadual VARCHAR(50),
            destinatario_nome VARCHAR(255),
            destinatario_endereco TEXT,
            destinatario_cidade VARCHAR(100),
            destinatario_estado VARCHAR(50),
            destinatario_cnpj_cpf VARCHAR(50),
            destinatario_inscricao_estadual VARCHAR(50),
            mercadoria_natureza VARCHAR(255),
            mercadoria_documento_fiscal VARCHAR(100),
            mercadoria_nota_fiscal VARCHAR(100),
            mercadoria_valor DECIMAL(12,2),
            mercadoria_quantidade DECIMAL(12,3),
            mercadoria_peso DECIMAL(12,3),
            mercadoria_unidade VARCHAR(50),
            valor_seguro DECIMAL(12,2),
            valor_icms DECIMAL(12,2),
            valor_outros DECIMAL(12,2),
            valor_total_frete DECIMAL(12,2),
            observacoes TEXT,
            motorista_nome VARCHAR(255),
            motorista_cpf VARCHAR(50),
            motorista_telefone VARCHAR(50),
            veiculo_placa VARCHAR(50),
            veiculo_cidade VARCHAR(100),
            veiculo_estado VARCHAR(50),
            fatura_nome VARCHAR(255),
            agente_nome VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS faturas (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) UNIQUE NOT NULL
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS agentes (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) UNIQUE NOT NULL
          )
        `);
        await migrateSchema(client);
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            nome VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash VARCHAR(64) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Initial insert
        const checkCompany = await client.query("SELECT COUNT(*) FROM company_profile");
        if (parseInt(checkCompany.rows[0].count) === 0) {
          const def = DEFAULT_JSON_DB.company_profile;
          await client.query(`
            INSERT INTO company_profile (id, nome_empresa, nome_fantasia, cnpj, inscricao_estadual, endereco, telefone)
            VALUES (1, $1, $2, $3, $4, $5, $6)
          `, [def.nome_empresa, def.nome_fantasia, def.cnpj, def.inscricao_estadual, def.endereco, def.telefone]);
        }

        await client.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
        console.log("PostgreSQL tables checked/created successfully.");
      } finally {
        client.release();
      }
      await ensureDefaultAdmin();
    } catch (err) {
      console.error("PostgreSQL connection error during initialization. Falling back to Local JSON database mode.", err);
      isPostgresActive = false;
    }
  }

  // Ensure JSON database exists if we're in fallback mode
  if (!isPostgresActive) {
    readJsonDb();
    console.log("Using zero-dependency JSON database storage: db.json");
    await ensureDefaultAdmin();
  }
}

export function isUsingPostgres(): boolean {
  return isPostgresActive;
}

const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || "admin123";

async function ensureDefaultAdmin() {
  const count = await countUsersInternal();
  if (count > 0) return;
  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  if (isPostgresActive && pool) {
    await pool.query(
      `INSERT INTO users (username, password_hash, nome, role) VALUES ($1, $2, $3, $4)`,
      ["admin", hash, "Administrador", "admin"]
    );
    console.log(`Usuário admin criado. Senha inicial: ${DEFAULT_ADMIN_PASSWORD} (defina ADMIN_INITIAL_PASSWORD no .env)`);
  } else {
    const db = readJsonDb();
    if (!db.users) db.users = [];
    db.users.push({ id: 1, username: "admin", password_hash: hash, nome: "Administrador", role: "admin" });
    if (!db.sessions) db.sessions = [];
    writeJsonDb(db);
    console.log(`Usuário admin criado (JSON). Senha inicial: ${DEFAULT_ADMIN_PASSWORD}`);
  }
}

async function countUsersInternal(): Promise<number> {
  if (isPostgresActive && pool) {
    const res = await pool.query("SELECT COUNT(*)::int AS c FROM users");
    return res.rows[0].c;
  }
  const db = readJsonDb();
  return (db.users || []).length;
}

function newSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getSessionStore(): SessionStore {
  return {
    async createSession(userId: number) {
      const token = newSessionToken();
      const tokenHash = hashToken(token);
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      if (isPostgresActive && pool) {
        await pool.query(
          `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          [userId, tokenHash, expires]
        );
      } else {
        const db = readJsonDb();
        if (!db.sessions) db.sessions = [];
        db.sessions.push({
          id: db.sessions.length ? Math.max(...db.sessions.map((s) => s.id)) + 1 : 1,
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expires.toISOString(),
        });
        writeJsonDb(db);
      }
      return token;
    },

    async getUserBySession(token: string) {
      const tokenHash = hashToken(token);
      if (isPostgresActive && pool) {
        const res = await pool.query(
          `SELECT u.id, u.username, u.nome, u.role FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
          [tokenHash]
        );
        return res.rows[0] || null;
      }
      const db = readJsonDb();
      const session = (db.sessions || []).find(
        (s) => s.token_hash === tokenHash && new Date(s.expires_at) > new Date()
      );
      if (!session) return null;
      const user = (db.users || []).find((u) => u.id === session.user_id);
      if (!user) return null;
      return { id: user.id, username: user.username, nome: user.nome, role: user.role };
    },

    async deleteSession(token: string) {
      const tokenHash = hashToken(token);
      if (isPostgresActive && pool) {
        await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
      } else {
        const db = readJsonDb();
        db.sessions = (db.sessions || []).filter((s) => s.token_hash !== tokenHash);
        writeJsonDb(db);
      }
    },

    async findUserByUsername(username: string) {
      if (isPostgresActive && pool) {
        const res = await pool.query(
          `SELECT id, username, password_hash, nome, role FROM users WHERE username = $1`,
          [username]
        );
        return res.rows[0] || null;
      }
      const db = readJsonDb();
      const user = (db.users || []).find((u) => u.username === username);
      return user || null;
    },

    async createUser(username: string, password: string, nome: string, role = "user") {
      const hash = await bcrypt.hash(password, 10);
      if (isPostgresActive && pool) {
        const res = await pool.query(
          `INSERT INTO users (username, password_hash, nome, role) VALUES ($1, $2, $3, $4) RETURNING id, username, nome, role`,
          [username, hash, nome, role]
        );
        return res.rows[0];
      }
      const db = readJsonDb();
      if (!db.users) db.users = [];
      const item = {
        id: db.users.length ? Math.max(...db.users.map((u) => u.id)) + 1 : 1,
        username,
        password_hash: hash,
        nome,
        role,
      };
      db.users.push(item);
      writeJsonDb(db);
      return { id: item.id, username, nome, role };
    },

    async countUsers() {
      return countUsersInternal();
    },

    async updatePassword(userId: number, passwordHash: string) {
      if (isPostgresActive && pool) {
        await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
          passwordHash,
          userId,
        ]);
        return;
      }
      const db = readJsonDb();
      const user = (db.users || []).find((u) => u.id === userId);
      if (user) {
        user.password_hash = passwordHash;
        writeJsonDb(db);
      }
    },
  };
}

function mapCompanyRow(row: Record<string, unknown>): CompanyProfile {
  return normalizeCompanyProfile({
    nome_empresa: String(row.nome_empresa || ""),
    nome_fantasia: String(row.nome_fantasia || ""),
    cnpj: String(row.cnpj || ""),
    inscricao_estadual: String(row.inscricao_estadual || ""),
    endereco: String(row.endereco || ""),
    endereco_logradouro: String(row.endereco_logradouro || ""),
    endereco_numero: String(row.endereco_numero || ""),
    endereco_complemento: String(row.endereco_complemento || ""),
    endereco_bairro: String(row.endereco_bairro || ""),
    endereco_cidade: String(row.endereco_cidade || ""),
    endereco_estado: String(row.endereco_estado || ""),
    telefone: String(row.telefone || ""),
    email: String(row.email || ""),
    cep: String(row.cep || ""),
    logo_base64: String(row.logo_base64 || ""),
  });
}

// 1. Company Profile CRUD
export async function getCompanyProfile(): Promise<CompanyProfile> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM company_profile ORDER BY id ASC LIMIT 1");
      if (res.rows.length > 0) {
        return mapCompanyRow(res.rows[0]);
      }
    } catch (err) {
      console.error("PG error, falling back to JSON:", err);
    }
  }
  const db = readJsonDb();
  return normalizeCompanyProfile(db.company_profile);
}

export async function saveCompanyProfile(profile: CompanyProfile): Promise<CompanyProfile> {
  const normalized = normalizeCompanyProfile(profile);

  if (isPostgresActive && pool) {
    try {
      await pool.query(
        `
        INSERT INTO company_profile (
          id, nome_empresa, nome_fantasia, cnpj, inscricao_estadual, endereco,
          endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro,
          endereco_cidade, endereco_estado, telefone, email, cep, logo_base64
        )
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          nome_empresa = EXCLUDED.nome_empresa,
          nome_fantasia = EXCLUDED.nome_fantasia,
          cnpj = EXCLUDED.cnpj,
          inscricao_estadual = EXCLUDED.inscricao_estadual,
          endereco = EXCLUDED.endereco,
          endereco_logradouro = EXCLUDED.endereco_logradouro,
          endereco_numero = EXCLUDED.endereco_numero,
          endereco_complemento = EXCLUDED.endereco_complemento,
          endereco_bairro = EXCLUDED.endereco_bairro,
          endereco_cidade = EXCLUDED.endereco_cidade,
          endereco_estado = EXCLUDED.endereco_estado,
          telefone = EXCLUDED.telefone,
          email = EXCLUDED.email,
          cep = EXCLUDED.cep,
          logo_base64 = EXCLUDED.logo_base64
      `,
        [
          normalized.nome_empresa,
          normalized.nome_fantasia,
          normalized.cnpj,
          normalized.inscricao_estadual,
          normalized.endereco,
          normalized.endereco_logradouro || "",
          normalized.endereco_numero || "",
          normalized.endereco_complemento || "",
          normalized.endereco_bairro || "",
          normalized.endereco_cidade || "",
          normalized.endereco_estado || "",
          normalized.telefone,
          normalized.email || "",
          normalized.cep || "",
          normalized.logo_base64 || "",
        ]
      );
      return normalized;
    } catch (err) {
      console.error("PG error, falling back to JSON:", err);
    }
  }
  const db = readJsonDb();
  const jsonProfile: (typeof DEFAULT_JSON_DB)["company_profile"] = {
    nome_empresa: normalized.nome_empresa,
    nome_fantasia: normalized.nome_fantasia ?? "",
    cnpj: normalized.cnpj,
    inscricao_estadual: normalized.inscricao_estadual ?? "",
    endereco: normalized.endereco,
    endereco_logradouro: normalized.endereco_logradouro ?? "",
    endereco_numero: normalized.endereco_numero ?? "",
    endereco_complemento: normalized.endereco_complemento ?? "",
    endereco_bairro: normalized.endereco_bairro ?? "",
    endereco_cidade: normalized.endereco_cidade ?? "",
    endereco_estado: normalized.endereco_estado ?? "",
    telefone: normalized.telefone,
    email: normalized.email ?? "",
    cep: normalized.cep ?? "",
    logo_base64: normalized.logo_base64 ?? "",
  };
  db.company_profile = jsonProfile;
  writeJsonDb(db);
  return normalized;
}

// 2. Senders Catalogs
export async function getSenders(): Promise<CatalogItem[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM senders ORDER BY nome ASC");
      return res.rows;
    } catch (e) {
      console.error("PG error index senders:", e);
    }
  }
  return readJsonDb().senders;
}

export async function addSender(sender: CatalogItem): Promise<CatalogItem> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`
        INSERT INTO senders (nome, endereco, cidade, estado, cnpj_cpf, inscricao_estadual)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (nome) DO UPDATE SET
          endereco = EXCLUDED.endereco,
          cidade = EXCLUDED.cidade,
          estado = EXCLUDED.estado,
          cnpj_cpf = EXCLUDED.cnpj_cpf,
          inscricao_estadual = EXCLUDED.inscricao_estadual
        RETURNING *
      `, [sender.nome, sender.endereco, sender.cidade, sender.estado, sender.cnpj_cpf, sender.inscricao_estadual]);
      return res.rows[0];
    } catch (e) {
      console.error("PG error add sender:", e);
    }
  }
  const db = readJsonDb();
  const existingIndex = db.senders.findIndex(s => s.nome.toUpperCase() === sender.nome?.toUpperCase());
  if (existingIndex >= 0) {
    const updated = { ...db.senders[existingIndex], ...sender };
    db.senders[existingIndex] = updated;
    writeJsonDb(db);
    return updated;
  }
  const newItem = { id: db.senders.length > 0 ? Math.max(...db.senders.map(s => s.id)) + 1 : 1, ...sender } as any;
  db.senders.push(newItem);
  writeJsonDb(db);
  return newItem;
}

export async function updateSender(id: number, sender: CatalogItem): Promise<CatalogItem> {
  const nome = sender.nome?.trim();
  if (!nome) throw new Error("Nome é obrigatório");
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `UPDATE senders SET nome=$1, endereco=$2, cidade=$3, estado=$4, cnpj_cpf=$5, inscricao_estadual=$6
       WHERE id=$7 RETURNING *`,
      [nome, sender.endereco || "", sender.cidade || "", sender.estado || "", sender.cnpj_cpf || "", sender.inscricao_estadual || "", id]
    );
    if (!res.rows[0]) throw new Error("Remetente não encontrado.");
    return res.rows[0];
  }
  const db = readJsonDb();
  const idx = db.senders.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("Remetente não encontrado.");
  const updated = { ...db.senders[idx], ...sender, nome };
  db.senders[idx] = updated;
  writeJsonDb(db);
  return updated;
}

// 3. Recipients Catalogs
export async function getRecipients(): Promise<CatalogItem[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM recipients ORDER BY nome ASC");
      return res.rows;
    } catch (e) {
      console.error("PG error index recipients:", e);
    }
  }
  return readJsonDb().recipients;
}

export async function addRecipient(recipient: CatalogItem): Promise<CatalogItem> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`
        INSERT INTO recipients (nome, endereco, cidade, estado, cnpj_cpf, inscricao_estadual)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (nome) DO UPDATE SET
          endereco = EXCLUDED.endereco,
          cidade = EXCLUDED.cidade,
          estado = EXCLUDED.estado,
          cnpj_cpf = EXCLUDED.cnpj_cpf,
          inscricao_estadual = EXCLUDED.inscricao_estadual
        RETURNING *
      `, [recipient.nome, recipient.endereco, recipient.cidade, recipient.estado, recipient.cnpj_cpf, recipient.inscricao_estadual]);
      return res.rows[0];
    } catch (e) {
      console.error("PG error add recipient:", e);
    }
  }
  const db = readJsonDb();
  const existingIndex = db.recipients.findIndex(r => r.nome.toUpperCase() === recipient.nome?.toUpperCase());
  if (existingIndex >= 0) {
    const updated = { ...db.recipients[existingIndex], ...recipient };
    db.recipients[existingIndex] = updated;
    writeJsonDb(db);
    return updated;
  }
  const newItem = { id: db.recipients.length > 0 ? Math.max(...db.recipients.map(r => r.id)) + 1 : 1, ...recipient } as any;
  db.recipients.push(newItem);
  writeJsonDb(db);
  return newItem;
}

export async function updateRecipient(id: number, recipient: CatalogItem): Promise<CatalogItem> {
  const nome = recipient.nome?.trim();
  if (!nome) throw new Error("Nome é obrigatório");
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `UPDATE recipients SET nome=$1, endereco=$2, cidade=$3, estado=$4, cnpj_cpf=$5, inscricao_estadual=$6
       WHERE id=$7 RETURNING *`,
      [nome, recipient.endereco || "", recipient.cidade || "", recipient.estado || "", recipient.cnpj_cpf || "", recipient.inscricao_estadual || "", id]
    );
    if (!res.rows[0]) throw new Error("Destinatário não encontrado.");
    return res.rows[0];
  }
  const db = readJsonDb();
  const idx = db.recipients.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Destinatário não encontrado.");
  const updated = { ...db.recipients[idx], ...recipient, nome };
  db.recipients[idx] = updated;
  writeJsonDb(db);
  return updated;
}

function enrichDriverWithVehicle(driver: CatalogItem, vehicles: CatalogItem[]): CatalogItem {
  if (!driver.vehicle_id) return driver;
  const v = vehicles.find((x) => x.id === driver.vehicle_id);
  if (!v) return driver;
  return {
    ...driver,
    placa: v.placa,
    cidade: v.cidade,
    estado: v.estado,
  };
}

// 4. Drivers Catalogs
export async function getDrivers(): Promise<CatalogItem[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`
        SELECT d.id, d.nome, d.cpf, d.telefone, d.vehicle_id, d.agente_id,
               v.placa, v.cidade, v.estado,
               a.nome AS agente_nome
        FROM drivers d
        LEFT JOIN vehicles v ON v.id = d.vehicle_id
        LEFT JOIN agentes a ON a.id = d.agente_id
        ORDER BY d.nome ASC
      `);
      return res.rows;
    } catch (e) {
      console.error("PG error index drivers:", e);
    }
  }
  const db = readJsonDb();
  return db.drivers.map((d) => enrichDriverWithAgente(enrichDriverWithVehicle(d, db.vehicles), db.agentes || []));
}

function enrichDriverWithAgente(driver: CatalogItem, agentes: CatalogItem[]): CatalogItem {
  if (!driver.agente_id) return driver;
  const a = agentes.find((x) => x.id === driver.agente_id);
  if (!a?.nome) return driver;
  return { ...driver, agente_nome: a.nome };
}

export async function addDriver(driver: CatalogItem): Promise<CatalogItem> {
  return saveDriverWithVehicle({
    nome: driver.nome || "",
    cpf: driver.cpf,
    telefone: driver.telefone,
    vehicle_link: driver.vehicle_id ? "existing" : "none",
    vehicle_id: driver.vehicle_id ?? undefined,
  });
}

export async function saveDriverWithVehicle(payload: DriverSavePayload): Promise<CatalogItem> {
  let vehicleId: number | null = null;

  if (payload.vehicle_link === "existing" && payload.vehicle_id) {
    vehicleId = payload.vehicle_id;
  } else if (payload.vehicle_link === "new" && payload.placa?.trim()) {
    const vehicle = await addVehicle({
      placa: payload.placa.trim().toUpperCase(),
      cidade: payload.cidade?.trim() || "",
      estado: payload.estado?.trim().toUpperCase() || "",
    });
    vehicleId = vehicle.id ?? null;
  }

  const nome = payload.nome.trim();
  if (!nome) throw new Error("Nome do motorista é obrigatório");

  if (isPostgresActive && pool) {
    const res = payload.id
      ? await pool.query(
          `UPDATE drivers SET nome=$1, cpf=$2, telefone=$3, vehicle_id=$4, agente_id=$5
           WHERE id=$6
           RETURNING id, nome, cpf, telefone, vehicle_id, agente_id`,
          [nome, payload.cpf || "", payload.telefone || "", vehicleId, payload.agente_id ?? null, payload.id]
        )
      : await pool.query(
          `
        INSERT INTO drivers (nome, cpf, telefone, vehicle_id, agente_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (nome) DO UPDATE SET
          cpf = EXCLUDED.cpf,
          telefone = EXCLUDED.telefone,
          vehicle_id = EXCLUDED.vehicle_id,
          agente_id = EXCLUDED.agente_id
        RETURNING id, nome, cpf, telefone, vehicle_id, agente_id
      `,
          [nome, payload.cpf || "", payload.telefone || "", vehicleId, payload.agente_id ?? null]
        );
    const row = res.rows[0] as CatalogItem;
    if (!row) throw new Error("Motorista não encontrado.");
    if (vehicleId) {
      const v = await pool.query("SELECT placa, cidade, estado FROM vehicles WHERE id = $1", [vehicleId]);
      if (v.rows[0]) Object.assign(row, v.rows[0]);
    }
    if (payload.agente_id) {
      const a = await pool.query("SELECT nome FROM agentes WHERE id = $1", [payload.agente_id]);
      if (a.rows[0]?.nome) row.agente_nome = a.rows[0].nome;
    }
    return row;
  }

  const db = readJsonDb();
  let idx = payload.id != null ? db.drivers.findIndex((d) => d.id === payload.id) : -1;
  if (idx < 0) idx = db.drivers.findIndex((d) => d.nome.toUpperCase() === nome.toUpperCase());
  const base: CatalogItem = {
    id:
      idx >= 0
        ? db.drivers[idx].id
        : db.drivers.length > 0
          ? Math.max(...db.drivers.map((d) => d.id!)) + 1
          : 1,
    nome,
    cpf: payload.cpf || "",
    telefone: payload.telefone || "",
    vehicle_id: vehicleId,
    agente_id: payload.agente_id ?? null,
  };
  if (idx >= 0) db.drivers[idx] = base;
  else db.drivers.push(base);
  writeJsonDb(db);
  return enrichDriverWithAgente(enrichDriverWithVehicle(base, db.vehicles), db.agentes || []);
}

export async function updateDriver(id: number, payload: DriverSavePayload): Promise<CatalogItem> {
  return saveDriverWithVehicle({ ...payload, id });
}

// Faturas (nomes para campo Fatura do espelho)
export async function getFaturas(): Promise<CatalogItem[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM faturas ORDER BY nome ASC");
      return res.rows;
    } catch (e) {
      console.error("PG error index faturas:", e);
    }
  }
  return readJsonDb().faturas || [];
}

export async function addFatura(item: CatalogItem): Promise<CatalogItem> {
  const nome = item.nome?.trim();
  if (!nome) throw new Error("Nome da fatura é obrigatório");
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `INSERT INTO faturas (nome) VALUES ($1)
       ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING *`,
      [nome]
    );
    return res.rows[0];
  }
  const db = readJsonDb();
  if (!db.faturas) db.faturas = [];
  const idx = db.faturas.findIndex((f) => f.nome?.toUpperCase() === nome.toUpperCase());
  const row: CatalogItem = {
    id: idx >= 0 ? db.faturas[idx].id : db.faturas.length > 0 ? Math.max(...db.faturas.map((f) => f.id!)) + 1 : 1,
    nome,
  };
  if (idx >= 0) db.faturas[idx] = row;
  else db.faturas.push(row);
  writeJsonDb(db);
  return row;
}

export async function updateFatura(id: number, item: CatalogItem): Promise<CatalogItem> {
  const nome = item.nome?.trim();
  if (!nome) throw new Error("Nome da fatura é obrigatório");
  if (isPostgresActive && pool) {
    const res = await pool.query(`UPDATE faturas SET nome=$1 WHERE id=$2 RETURNING *`, [nome, id]);
    if (!res.rows[0]) throw new Error("Fatura não encontrada.");
    return res.rows[0];
  }
  const db = readJsonDb();
  if (!db.faturas) throw new Error("Fatura não encontrada.");
  const idx = db.faturas.findIndex((f) => f.id === id);
  if (idx < 0) throw new Error("Fatura não encontrada.");
  db.faturas[idx] = { ...db.faturas[idx], nome };
  writeJsonDb(db);
  return db.faturas[idx];
}

export async function deleteFatura(id: number) {
  return deleteCatalogRow("faturas", id);
}

// Agentes (nomes para campo Agente do espelho)
export async function getAgentes(): Promise<CatalogItem[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM agentes ORDER BY nome ASC");
      return res.rows;
    } catch (e) {
      console.error("PG error index agentes:", e);
    }
  }
  return readJsonDb().agentes || [];
}

export async function addAgente(item: CatalogItem): Promise<CatalogItem> {
  const nome = item.nome?.trim();
  if (!nome) throw new Error("Nome do agente é obrigatório");
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `INSERT INTO agentes (nome) VALUES ($1)
       ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING *`,
      [nome]
    );
    return res.rows[0];
  }
  const db = readJsonDb();
  if (!db.agentes) db.agentes = [];
  const idx = db.agentes.findIndex((a) => a.nome?.toUpperCase() === nome.toUpperCase());
  const row: CatalogItem = {
    id: idx >= 0 ? db.agentes[idx].id : db.agentes.length > 0 ? Math.max(...db.agentes.map((a) => a.id!)) + 1 : 1,
    nome,
  };
  if (idx >= 0) db.agentes[idx] = row;
  else db.agentes.push(row);
  writeJsonDb(db);
  return row;
}

export async function updateAgente(id: number, item: CatalogItem): Promise<CatalogItem> {
  const nome = item.nome?.trim();
  if (!nome) throw new Error("Nome do agente é obrigatório");
  if (isPostgresActive && pool) {
    const res = await pool.query(`UPDATE agentes SET nome=$1 WHERE id=$2 RETURNING *`, [nome, id]);
    if (!res.rows[0]) throw new Error("Agente não encontrado.");
    return res.rows[0];
  }
  const db = readJsonDb();
  if (!db.agentes) throw new Error("Agente não encontrado.");
  const idx = db.agentes.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error("Agente não encontrado.");
  db.agentes[idx] = { ...db.agentes[idx], nome };
  writeJsonDb(db);
  return db.agentes[idx];
}

export async function deleteAgente(id: number) {
  return deleteCatalogRow("agentes", id);
}

// 5. Vehicles Catalogs
export async function getVehicles(): Promise<CatalogItem[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM vehicles ORDER BY placa ASC");
      return res.rows;
    } catch (e) {
      console.error("PG error index vehicles:", e);
    }
  }
  return readJsonDb().vehicles;
}

export async function addVehicle(vehicle: CatalogItem): Promise<CatalogItem> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`
        INSERT INTO vehicles (placa, cidade, estado)
        VALUES ($1, $2, $3)
        ON CONFLICT (placa) DO UPDATE SET
          cidade = EXCLUDED.cidade,
          estado = EXCLUDED.estado
        RETURNING *
      `, [vehicle.placa?.toUpperCase(), vehicle.cidade, vehicle.estado]);
      return res.rows[0];
    } catch (e) {
      console.error("PG error add vehicle:", e);
    }
  }
  const db = readJsonDb();
  const existingIndex = db.vehicles.findIndex(v => v.placa.toUpperCase() === vehicle.placa?.toUpperCase());
  if (existingIndex >= 0) {
    const updated = { ...db.vehicles[existingIndex], ...vehicle };
    db.vehicles[existingIndex].placa = vehicle.placa?.toUpperCase() || "";
    writeJsonDb(db);
    return updated;
  }
  const newItem = { id: db.vehicles.length > 0 ? Math.max(...db.vehicles.map(v => v.id)) + 1 : 1, ...vehicle, placa: vehicle.placa?.toUpperCase() } as any;
  db.vehicles.push(newItem);
  writeJsonDb(db);
  return newItem;
}

export async function updateVehicle(id: number, vehicle: CatalogItem): Promise<CatalogItem> {
  const placa = vehicle.placa?.trim().toUpperCase();
  if (!placa) throw new Error("Placa é obrigatória");
  if (isPostgresActive && pool) {
    const res = await pool.query(
      `UPDATE vehicles SET placa=$1, cidade=$2, estado=$3 WHERE id=$4 RETURNING *`,
      [placa, vehicle.cidade || "", vehicle.estado || "", id]
    );
    if (!res.rows[0]) throw new Error("Veículo não encontrado.");
    return res.rows[0];
  }
  const db = readJsonDb();
  const idx = db.vehicles.findIndex((v) => v.id === id);
  if (idx < 0) throw new Error("Veículo não encontrado.");
  const updated = { ...db.vehicles[idx], placa, cidade: vehicle.cidade, estado: vehicle.estado };
  db.vehicles[idx] = updated;
  writeJsonDb(db);
  return updated;
}

// 6. Receipts Management
export async function getReceipts(): Promise<Receipt[]> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("SELECT * FROM receipts ORDER BY id DESC");
      return res.rows.map(row => ({
        ...row,
        // Convert dates to string YYYY-MM-DD
        data_recibo: row.data_recibo ? new Date(row.data_recibo).toISOString().split('T')[0] : ""
      }));
    } catch (err) {
      console.error("PG error fetching receipts:", err);
    }
  }
  return readJsonDb().receipts;
}

export async function getNextReceiptNumber(): Promise<string> {
  let maxNum = 0;
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`
        SELECT COALESCE(MAX(
          CASE WHEN numero_recibo ~ '^[0-9]+$' THEN numero_recibo::integer ELSE 0 END
        ), 0) AS max_num FROM receipts
      `);
      maxNum = parseInt(res.rows[0].max_num, 10) || 0;
    } catch (e) {
      console.error("PG error getting max receipt number:", e);
    }
  } else {
    const db = readJsonDb();
    for (const r of db.receipts) {
      const n = parseInt(String(r.numero_recibo).replace(/\D/g, ""), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return String(maxNum + 1);
}

function toDbNumber(val: unknown, precision: number, scale: number): number {
  return clampPgDecimal(parseBrDecimal(val as string | number), precision, scale);
}

function normalizeReceiptForSave(receipt: Receipt): Receipt {
  return {
    ...receipt,
    mercadoria_valor: toDbNumber(receipt.mercadoria_valor, 15, 2),
    mercadoria_quantidade: toDbNumber(receipt.mercadoria_quantidade, 15, 3),
    mercadoria_peso: toDbNumber(receipt.mercadoria_peso, 15, 3),
    valor_seguro: toDbNumber(receipt.valor_seguro, 15, 2),
    valor_icms: toDbNumber(receipt.valor_icms, 15, 2),
    valor_outros: toDbNumber(receipt.valor_outros, 15, 2),
    valor_total_frete: toDbNumber(receipt.valor_total_frete, 15, 2),
  };
}

/** Fatura e agente no espelho seguem o motorista quando não informados. */
function applyTransportDefaults(receipt: Receipt): Receipt {
  const motorista = (receipt.motorista_nome || "").trim();
  return {
    ...receipt,
    fatura_nome: (receipt.fatura_nome || "").trim() || motorista,
    agente_nome: (receipt.agente_nome || "").trim() || motorista,
  };
}

async function syncReceiptCatalogEntries(receipt: Receipt): Promise<void> {
  if (receipt.remetente_nome) {
    await addSender({
      nome: receipt.remetente_nome,
      endereco: receipt.remetente_endereco,
      cidade: receipt.remetente_cidade,
      estado: receipt.remetente_estado,
      cnpj_cpf: receipt.remetente_cnpj_cpf,
      inscricao_estadual: receipt.remetente_inscricao_estadual,
    });
  }

  if (receipt.destinatario_nome) {
    await addRecipient({
      nome: receipt.destinatario_nome,
      endereco: receipt.destinatario_endereco,
      cidade: receipt.destinatario_cidade,
      estado: receipt.destinatario_estado,
      cnpj_cpf: receipt.destinatario_cnpj_cpf,
      inscricao_estadual: receipt.destinatario_inscricao_estadual,
    });
  }

  if (receipt.motorista_nome) {
    await addDriver({
      nome: receipt.motorista_nome,
      cpf: receipt.motorista_cpf,
      telefone: receipt.motorista_telefone,
    });
  }

  if (receipt.veiculo_placa) {
    await addVehicle({
      placa: receipt.veiculo_placa,
      cidade: receipt.veiculo_cidade,
      estado: receipt.veiculo_estado,
    });
  }
}

const RECEIPT_ROW_PARAMS = (receipt: Receipt) => [
  receipt.numero_recibo,
  receipt.data_recibo,
  receipt.has_qrcode || false,
  receipt.has_signature || false,
  receipt.is_blank || false,
  receipt.remetente_nome,
  receipt.remetente_endereco,
  receipt.remetente_cidade,
  receipt.remetente_estado,
  receipt.remetente_cnpj_cpf,
  receipt.remetente_inscricao_estadual,
  receipt.destinatario_nome,
  receipt.destinatario_endereco,
  receipt.destinatario_cidade,
  receipt.destinatario_estado,
  receipt.destinatario_cnpj_cpf,
  receipt.destinatario_inscricao_estadual,
  receipt.mercadoria_natureza,
  receipt.mercadoria_documento_fiscal || "",
  receipt.mercadoria_nota_fiscal,
  receipt.mercadoria_valor || 0,
  receipt.mercadoria_quantidade || 0,
  receipt.mercadoria_peso || 0,
  receipt.mercadoria_unidade,
  receipt.valor_seguro || 0,
  receipt.valor_icms || 0,
  receipt.valor_outros || 0,
  receipt.valor_total_frete || 0,
  receipt.observacoes,
  receipt.motorista_nome,
  receipt.motorista_cpf,
  receipt.motorista_telefone,
  receipt.veiculo_placa,
  receipt.veiculo_cidade,
  receipt.veiculo_estado,
  receipt.fatura_nome || "",
  receipt.agente_nome || "",
];

function mapPgReceiptRow(saved: Record<string, unknown>): Receipt {
  const row = saved as unknown as Receipt;
  return {
    ...row,
    data_recibo: saved.data_recibo
      ? new Date(saved.data_recibo as string).toISOString().split("T")[0]
      : "",
  };
}

export async function createReceipt(receipt: Receipt): Promise<Receipt> {
  receipt = applyTransportDefaults(normalizeReceiptForSave(receipt));

  if (!receipt.numero_recibo) {
    receipt.numero_recibo = await getNextReceiptNumber();
  }

  await syncReceiptCatalogEntries(receipt);

  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`
        INSERT INTO receipts (
          numero_recibo, data_recibo, has_qrcode, has_signature, is_blank,
          remetente_nome, remetente_endereco, remetente_cidade, remetente_estado, remetente_cnpj_cpf, remetente_inscricao_estadual,
          destinatario_nome, destinatario_endereco, destinatario_cidade, destinatario_estado, destinatario_cnpj_cpf, destinatario_inscricao_estadual,
          mercadoria_natureza, mercadoria_documento_fiscal, mercadoria_nota_fiscal, mercadoria_valor, mercadoria_quantidade, mercadoria_peso, mercadoria_unidade,
          valor_seguro, valor_icms, valor_outros, valor_total_frete, observacoes,
          motorista_nome, motorista_cpf, motorista_telefone, veiculo_placa, veiculo_cidade, veiculo_estado,
          fatura_nome, agente_nome
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, $33, $34, $35,
          $36, $37
        )
        ON CONFLICT (numero_recibo) DO UPDATE SET
          data_recibo = EXCLUDED.data_recibo,
          has_qrcode = EXCLUDED.has_qrcode,
          has_signature = EXCLUDED.has_signature,
          is_blank = EXCLUDED.is_blank,
          remetente_nome = EXCLUDED.remetente_nome,
          remetente_endereco = EXCLUDED.remetente_endereco,
          remetente_cidade = EXCLUDED.remetente_cidade,
          remetente_estado = EXCLUDED.remetente_estado,
          remetente_cnpj_cpf = EXCLUDED.remetente_cnpj_cpf,
          remetente_inscricao_estadual = EXCLUDED.remetente_inscricao_estadual,
          destinatario_nome = EXCLUDED.destinatario_nome,
          destinatario_endereco = EXCLUDED.destinatario_endereco,
          destinatario_cidade = EXCLUDED.destinatario_cidade,
          destinatario_estado = EXCLUDED.destinatario_estado,
          destinatario_cnpj_cpf = EXCLUDED.destinatario_cnpj_cpf,
          destinatario_inscricao_estadual = EXCLUDED.destinatario_inscricao_estadual,
          mercadoria_natureza = EXCLUDED.mercadoria_natureza,
          mercadoria_documento_fiscal = EXCLUDED.mercadoria_documento_fiscal,
          mercadoria_nota_fiscal = EXCLUDED.mercadoria_nota_fiscal,
          mercadoria_valor = EXCLUDED.mercadoria_valor,
          mercadoria_quantidade = EXCLUDED.mercadoria_quantidade,
          mercadoria_peso = EXCLUDED.mercadoria_peso,
          mercadoria_unidade = EXCLUDED.mercadoria_unidade,
          valor_seguro = EXCLUDED.valor_seguro,
          valor_icms = EXCLUDED.valor_icms,
          valor_outros = EXCLUDED.valor_outros,
          valor_total_frete = EXCLUDED.valor_total_frete,
          observacoes = EXCLUDED.observacoes,
          motorista_nome = EXCLUDED.motorista_nome,
          motorista_cpf = EXCLUDED.motorista_cpf,
          motorista_telefone = EXCLUDED.motorista_telefone,
          veiculo_placa = EXCLUDED.veiculo_placa,
          veiculo_cidade = EXCLUDED.veiculo_cidade,
          veiculo_estado = EXCLUDED.veiculo_estado,
          fatura_nome = EXCLUDED.fatura_nome,
          agente_nome = EXCLUDED.agente_nome
        RETURNING *
      `, RECEIPT_ROW_PARAMS(receipt));
      return mapPgReceiptRow(res.rows[0]);
    } catch (err) {
      console.error("PG error creating receipt:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("overflow") || msg.includes("numeric")) {
        throw new Error(
          "Valor numérico inválido (peso, quantidade ou valores). Confira os campos e use o formato brasileiro, ex.: 18.500,00."
        );
      }
      throw err instanceof Error ? err : new Error("Falha ao gravar espelho no PostgreSQL.");
    }
  }

  const db = readJsonDb();
  const existingIdx = db.receipts.findIndex(r => r.numero_recibo === receipt.numero_recibo);
  const itemToSave = {
    ...receipt,
    id: existingIdx >= 0 ? db.receipts[existingIdx].id : (db.receipts.length > 0 ? Math.max(...db.receipts.map(r => r.id || 0)) + 1 : 1)
  };
  
  if (existingIdx >= 0) {
    db.receipts[existingIdx] = itemToSave;
  } else {
    db.receipts.push(itemToSave);
  }
  writeJsonDb(db);
  return itemToSave;
}

export async function updateReceipt(id: number, receipt: Receipt): Promise<Receipt> {
  receipt = applyTransportDefaults(normalizeReceiptForSave({ ...receipt, id }));

  if (!receipt.numero_recibo) {
    throw new Error("Número do espelho é obrigatório.");
  }

  await syncReceiptCatalogEntries(receipt);

  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(
        `
        UPDATE receipts SET
          numero_recibo = $1,
          data_recibo = $2,
          has_qrcode = $3,
          has_signature = $4,
          is_blank = $5,
          remetente_nome = $6,
          remetente_endereco = $7,
          remetente_cidade = $8,
          remetente_estado = $9,
          remetente_cnpj_cpf = $10,
          remetente_inscricao_estadual = $11,
          destinatario_nome = $12,
          destinatario_endereco = $13,
          destinatario_cidade = $14,
          destinatario_estado = $15,
          destinatario_cnpj_cpf = $16,
          destinatario_inscricao_estadual = $17,
          mercadoria_natureza = $18,
          mercadoria_documento_fiscal = $19,
          mercadoria_nota_fiscal = $20,
          mercadoria_valor = $21,
          mercadoria_quantidade = $22,
          mercadoria_peso = $23,
          mercadoria_unidade = $24,
          valor_seguro = $25,
          valor_icms = $26,
          valor_outros = $27,
          valor_total_frete = $28,
          observacoes = $29,
          motorista_nome = $30,
          motorista_cpf = $31,
          motorista_telefone = $32,
          veiculo_placa = $33,
          veiculo_cidade = $34,
          veiculo_estado = $35,
          fatura_nome = $36,
          agente_nome = $37
        WHERE id = $38
        RETURNING *
      `,
        [...RECEIPT_ROW_PARAMS(receipt), id]
      );
      if (!res.rows[0]) throw new Error("Espelho não encontrado.");
      return mapPgReceiptRow(res.rows[0]);
    } catch (err) {
      console.error("PG error updating receipt:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("overflow") || msg.includes("numeric")) {
        throw new Error(
          "Valor numérico inválido (peso, quantidade ou valores). Confira os campos e use o formato brasileiro, ex.: 18.500,00."
        );
      }
      throw err instanceof Error ? err : new Error("Falha ao atualizar espelho no PostgreSQL.");
    }
  }

  const db = readJsonDb();
  const idx = db.receipts.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Espelho não encontrado.");
  const itemToSave = { ...receipt, id };
  db.receipts[idx] = itemToSave;
  writeJsonDb(db);
  return itemToSave;
}

async function deleteCatalogRow(
  table: "senders" | "recipients" | "drivers" | "vehicles" | "faturas" | "agentes",
  id: number
): Promise<boolean> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      return (res.rowCount || 0) > 0;
    } catch (err) {
      console.error(`PG error deleting from ${table}:`, err);
      return false;
    }
  }
  const db = readJsonDb();
  const filterById = <T extends { id?: number }>(arr: T[]) => arr.filter((x) => x.id !== id);
  if (table === "senders") {
    const before = db.senders.length;
    db.senders = filterById(db.senders);
    if (db.senders.length === before) return false;
  } else if (table === "recipients") {
    const before = db.recipients.length;
    db.recipients = filterById(db.recipients);
    if (db.recipients.length === before) return false;
  } else if (table === "drivers") {
    const before = db.drivers.length;
    db.drivers = filterById(db.drivers);
    if (db.drivers.length === before) return false;
  } else if (table === "vehicles") {
    const before = db.vehicles.length;
    db.vehicles = filterById(db.vehicles);
    if (db.vehicles.length === before) return false;
  } else if (table === "faturas") {
    if (!db.faturas) return false;
    const before = db.faturas.length;
    db.faturas = filterById(db.faturas);
    if (db.faturas.length === before) return false;
  } else {
    if (!db.agentes) return false;
    const before = db.agentes.length;
    db.agentes = filterById(db.agentes);
    if (db.agentes.length === before) return false;
  }
  writeJsonDb(db);
  return true;
}

export async function deleteSender(id: number) {
  return deleteCatalogRow("senders", id);
}
export async function deleteRecipient(id: number) {
  return deleteCatalogRow("recipients", id);
}
export async function deleteDriver(id: number) {
  return deleteCatalogRow("drivers", id);
}
export async function deleteVehicle(id: number) {
  return deleteCatalogRow("vehicles", id);
}

export async function deleteReceipt(id: number): Promise<boolean> {
  if (isPostgresActive && pool) {
    try {
      const res = await pool.query("DELETE FROM receipts WHERE id = $1", [id]);
      return (res.rowCount || 0) > 0;
    } catch (err) {
      console.error("PG error deleting receipt:", err);
    }
  }
  const db = readJsonDb();
  const index = db.receipts.findIndex(r => r.id === id);
  if (index >= 0) {
    db.receipts.splice(index, 1);
    writeJsonDb(db);
    return true;
  }
  return false;
}
