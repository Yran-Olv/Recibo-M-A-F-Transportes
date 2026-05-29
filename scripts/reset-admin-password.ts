/**
 * Redefine a senha do usuário admin para o valor de ADMIN_INITIAL_PASSWORD no .env
 * Uso: npx tsx scripts/reset-admin-password.ts
 */
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

dotenv.config();

const password = process.env.ADMIN_INITIAL_PASSWORD || "admin123";

async function main() {
  const { initDb, isUsingPostgres, getSessionStore } = await import("../src/server/db.ts");

  await initDb();

  if (!isUsingPostgres()) {
    const store = getSessionStore();
    const user = await store.findUserByUsername("admin");
    if (!user) {
      console.error("Usuário admin não encontrado (modo JSON).");
      process.exit(1);
    }
    const hash = await bcrypt.hash(password, 10);
    await store.updatePassword!(user.id, hash);
    console.log(`✓ Senha do admin resetada (db.json) para: ${password}`);
    return;
  }

  const pool = new pg.Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE username = 'admin' RETURNING id, username`,
    [hash]
  );
  await pool.end();

  if (!res.rowCount) {
    console.error("Usuário admin não encontrado no PostgreSQL.");
    process.exit(1);
  }

  console.log(`✓ Senha do admin resetada para: ${password}`);
  console.log("  Login: admin / (essa senha)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
