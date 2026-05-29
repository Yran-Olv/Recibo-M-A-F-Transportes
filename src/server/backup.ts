import fs from "fs";
import path from "path";
import {
  getCompanyProfile,
  getSenders,
  getRecipients,
  getDrivers,
  getVehicles,
  getFaturas,
  getAgentes,
  getReceipts,
  isUsingPostgres,
} from "./db.ts";

const BACKUPS_DIR = path.join(process.cwd(), "backups");

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function markerPath(): string {
  return path.join(BACKUPS_DIR, `.backup-${todayKey()}.done`);
}

/** Exporta todo o conteúdo do sistema para JSON (funciona com PostgreSQL ou db.json). */
export async function exportFullSnapshot() {
  return {
    exported_at: new Date().toISOString(),
    source: isUsingPostgres() ? "postgresql" : "json",
    company_profile: await getCompanyProfile(),
    senders: await getSenders(),
    recipients: await getRecipients(),
    drivers: await getDrivers(),
    vehicles: await getVehicles(),
    faturas: await getFaturas(),
    agentes: await getAgentes(),
    receipts: await getReceipts(),
  };
}

export interface BackupResult {
  ran: boolean;
  skipped?: boolean;
  path?: string;
  dbCopyPath?: string;
  error?: string;
}

/**
 * No primeiro acesso do dia (login ou sessão do dia), grava backup em /backups.
 */
export async function runDailyBackupIfNeeded(): Promise<BackupResult> {
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });

    if (fs.existsSync(markerPath())) {
      const existing = fs.readFileSync(markerPath(), "utf8").trim();
      return { ran: false, skipped: true, path: existing || undefined };
    }

    const snapshot = await exportFullSnapshot();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `maf-backup-${todayKey()}-${stamp}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf8");

    let dbCopyPath: string | undefined;
    const jsonDb = path.join(process.cwd(), "db.json");
    if (fs.existsSync(jsonDb)) {
      dbCopyPath = path.join(BACKUPS_DIR, `db-copy-${todayKey()}.json`);
      fs.copyFileSync(jsonDb, dbCopyPath);
    }

    fs.writeFileSync(markerPath(), filepath, "utf8");

    console.log(`[backup] Backup diário salvo: ${filepath}`);
    return { ran: true, path: filepath, dbCopyPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido no backup";
    console.error("[backup] Falha:", err);
    return { ran: false, error: msg };
  }
}
