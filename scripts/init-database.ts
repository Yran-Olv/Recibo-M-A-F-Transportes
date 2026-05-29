/**
 * Cria/verifica tabelas no PostgreSQL (usa credenciais do .env).
 * Rode: npm run db:init
 */
import dotenv from "dotenv";
dotenv.config();

const { initDb, isUsingPostgres } = await import("../src/server/db.ts");

async function main() {
  console.log("Conectando ao PostgreSQL…");
  console.log(
    `  host=${process.env.PGHOST || "127.0.0.1"} port=${process.env.PGPORT || "5432"} db=${process.env.PGDATABASE || "?"} user=${process.env.PGUSER || "?"}`
  );

  await initDb();

  if (!isUsingPostgres()) {
    console.error("\n✗ Não foi possível usar PostgreSQL.");
    console.error("  O sistema continuaria só com db.json (modo atual no seu log).");
    console.error("\nOpções:");
    console.error("  1) Docker:  npm run db:up   depois   npm run db:init");
    console.error("  2) Servidor Linux com sudo:");
    console.error("     DB_PASS='sua_senha' sudo ./install.sh");
    console.error("  3) No .env use PGHOST=127.0.0.1 (no servidor; Docker usa host.docker.internal no compose)");
    process.exit(1);
  }

  console.log("\n✓ PostgreSQL ativo — tabelas verificadas/criadas.");
  console.log("  Inicie o site: npm run dev");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
