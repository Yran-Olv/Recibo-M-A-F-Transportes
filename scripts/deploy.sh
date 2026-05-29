#!/usr/bin/env bash
# =============================================================================
# M.A.F Espelho de Frete — script único de deploy em produção
# =============================================================================
#
#   ./scripts/deploy.sh                 # deploy completo com Docker (padrão)
#   ./scripts/deploy.sh systemd         # deploy com systemd (sem Docker)
#   ./scripts/deploy.sh postgres        # só criar usuário/banco PostgreSQL
#   ./scripts/deploy.sh init-db         # só criar/atualizar tabelas
#   ./scripts/deploy.sh check-port      # só verificar porta (usa MAF_HOST_PORT ou 3010)
#
# Variáveis de ambiente úteis:
#   DB_PASS='senha'     — obrigatório para o comando postgres
#   INSTALL_DIR=/opt/maf-recibos  — destino no modo systemd
#   MAF_HOST_PORT=3010  — porta no host (Docker → Nginx)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CMD="${1:-deploy}"
ARG2="${2:-}"

# ---------------------------------------------------------------------------
log()  { echo "==> $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
M.A.F — deploy em produção (um comando)

  ./scripts/deploy.sh [comando]

Comandos:
  deploy          Deploy completo com Docker (padrão se omitir o comando)
  systemd         Deploy com build + systemd (PostgreSQL em 127.0.0.1)
  postgres        Cria usuário e banco PostgreSQL no servidor (precisa DB_PASS)
  init-db         Cria/atualiza tabelas no PostgreSQL (.env configurado)
  check-port      Verifica se a porta está livre (ex.: check-port 3010)

Exemplos:
  cp .env.production.example .env && nano .env
  DB_PASS='senha_forte' ./scripts/deploy.sh postgres
  ./scripts/deploy.sh init-db
  ./scripts/deploy.sh
  ./scripts/deploy.sh systemd

Depois: Nginx (scripts/nginx-maf-recibos.conf) + certbot --nginx -d dominio
EOF
}

load_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.production.example ]]; then
      warn "Arquivo .env não encontrado — copiando de .env.production.example"
      cp .env.production.example .env
      die "Edite o .env (SESSION_SECRET, PGPASSWORD, etc.) e rode o deploy de novo."
    fi
    die "Crie o .env a partir de .env.production.example"
  fi
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
}

check_port() {
  local port="${1:-${MAF_HOST_PORT:-3010}}"
  if command -v ss &>/dev/null; then
    if ss -tln | grep -q ":${port} "; then
      echo "✗ Porta ${port} em uso:"
      ss -tlnp | grep ":${port} " || true
      return 1
    fi
  elif command -v lsof &>/dev/null; then
    if lsof -iTCP:"${port}" -sTCP:LISTEN -P -n 2>/dev/null | grep -q .; then
      echo "✗ Porta ${port} em uso:"
      lsof -iTCP:"${port}" -sTCP:LISTEN -P -n || true
      return 1
    fi
  else
    die "Instale ss ou lsof para verificar portas."
  fi
  ok "Porta ${port} livre."
}

setup_postgres() {
  local db_name="${DB_NAME:-maf_recibos}"
  local db_user="${DB_USER:-maf_user}"
  local db_pass="${DB_PASS:-${PGPASSWORD:-}}"

  if [[ -z "$db_pass" ]]; then
    die "Defina DB_PASS ou PGPASSWORD no ambiente. Ex.: DB_PASS='senha' ./scripts/deploy.sh postgres"
  fi

  log "PostgreSQL: usuário ${db_user}, banco ${db_name}"

  if ! command -v psql &>/dev/null; then
    log "Instalando PostgreSQL..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
  fi

  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${db_user}') THEN
    CREATE USER ${db_user} WITH PASSWORD '${db_pass}';
  ELSE
    ALTER USER ${db_user} WITH PASSWORD '${db_pass}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${db_name} OWNER ${db_user}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db_name}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${db_name} TO ${db_user};
SQL

  sudo -u postgres psql -d "$db_name" -v ON_ERROR_STOP=1 -f "${ROOT}/db/schema.sql"

  ok "PostgreSQL pronto (127.0.0.1:5432)."
  echo "  Confira PGHOST/PGUSER/PGPASSWORD/PGDATABASE no .env"
}

init_db() {
  load_env
  log "Inicializando tabelas..."
  if ! command -v npx &>/dev/null; then
    die "Node/npm necessários. Rode: npm ci"
  fi
  npx tsx scripts/init-database.ts
  ok "Banco inicializado."
}

wait_health() {
  local url="$1"
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

print_nginx_next() {
  local port="${1:-${MAF_HOST_PORT:-3010}}"
  echo ""
  echo "── Próximo passo: Nginx + Certbot ──"
  echo "  1) Edite scripts/nginx-maf-recibos.conf (server_name e porta ${port})"
  echo "  2) sudo cp scripts/nginx-maf-recibos.conf /etc/nginx/sites-available/maf-recibos"
  echo "  3) sudo ln -sf /etc/nginx/sites-available/maf-recibos /etc/nginx/sites-enabled/"
  echo "  4) sudo nginx -t && sudo systemctl reload nginx"
  echo "  5) sudo certbot --nginx -d seu.dominio.com.br"
  echo ""
}

deploy_docker() {
  load_env
  local host_port="${MAF_HOST_PORT:-3010}"

  log "Verificando porta ${host_port}..."
  check_port "$host_port" || die "Altere MAF_HOST_PORT no .env (ex.: 3011)"

  log "Inicializando banco..."
  npx tsx scripts/init-database.ts

  log "Build e container Docker..."
  if ! command -v docker &>/dev/null; then
    die "Docker não encontrado. Instale Docker ou use: ./scripts/deploy.sh systemd"
  fi
  docker compose -f docker-compose.prod.yml up -d --build

  log "Aguardando aplicação..."
  if wait_health "http://127.0.0.1:${host_port}/api/health"; then
    ok "App em http://127.0.0.1:${host_port}/api/health"
  else
    warn "Health ainda não respondeu — logs: docker compose -f docker-compose.prod.yml logs -f"
  fi

  print_nginx_next "$host_port"
}

deploy_systemd() {
  load_env
  local install_dir="${INSTALL_DIR:-/opt/maf-recibos}"
  local app_port="${PORT:-3010}"

  log "Verificando porta ${app_port}..."
  check_port "$app_port" || die "Altere PORT no .env"

  log "Dependências e build..."
  npm ci
  npm run build

  log "Banco..."
  npx tsx scripts/init-database.ts

  log "Usuário de sistema maf (se não existir)..."
  sudo useradd -r -s /bin/false -d "$install_dir" maf 2>/dev/null || true

  log "Instalando em ${install_dir}..."
  sudo mkdir -p "${install_dir}/backups"
  sudo rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude db.json \
    dist package.json package-lock.json db scripts \
    "${install_dir}/"
  sudo cp .env "${install_dir}/.env"
  sudo chown -R maf:maf "${install_dir}" 2>/dev/null || sudo chown -R www-data:www-data "${install_dir}"

  log "npm ci --omit=dev em ${install_dir}..."
  (cd "${install_dir}" && sudo -u maf npm ci --omit=dev) || (cd "${install_dir}" && sudo npm ci --omit=dev)

  log "Systemd..."
  sudo cp scripts/maf-recibos.service /etc/systemd/system/maf-recibos.service
  sudo systemctl daemon-reload
  sudo systemctl enable maf-recibos
  sudo systemctl restart maf-recibos

  sleep 2
  if wait_health "http://127.0.0.1:${app_port}/api/health"; then
    ok "App em http://127.0.0.1:${app_port}"
  else
    warn "Verifique: sudo journalctl -u maf-recibos -f"
  fi

  print_nginx_next "$app_port"
}

# --- roteamento ---
case "$CMD" in
  -h|--help|help)
    usage
    ;;
  check-port)
    check_port "${ARG2:-${MAF_HOST_PORT:-3010}}"
    ;;
  postgres|setup-postgres|db-setup)
    setup_postgres
    ;;
  init-db|db-init|migrate)
    init_db
    ;;
  systemd|system)
    deploy_systemd
    ;;
  docker|deploy)
    deploy_docker
    ;;
  "")
    deploy_docker
    ;;
  *)
    echo "Comando desconhecido: $CMD"
    echo ""
    usage
    exit 1
    ;;
esac
