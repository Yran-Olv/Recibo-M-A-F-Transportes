#!/usr/bin/env bash
# =============================================================================
# M.A.F Espelho de Frete — script único de deploy em produção
# =============================================================================
#
#   ./install.sh                     # preferido em produção (/var/www/maf-recibos)
#   ./scripts/deploy.sh              # cria .env, banco, tabelas e sobe Docker
#   ./scripts/deploy.sh systemd
#   ./scripts/deploy.sh postgres | init-db | check-port
#
# Na primeira vez (interativo): pede senha do PostgreSQL e do admin.
# Sem terminal: use DB_PASS='senha' ./scripts/deploy.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f package-lock.json ]] || [[ ! -f package.json ]]; then
  echo "✗ Pasta do projeto incompleta (falta package.json / package-lock.json)." >&2
  echo "  Em produção, na primeira vez no servidor:" >&2
  echo "    cd /var/www" >&2
  echo "    sudo curl -fsSL https://raw.githubusercontent.com/Yran-Olv/Recibo-M-A-F-Transportes/main/scripts/bootstrap-production.sh -o bootstrap-maf.sh" >&2
  echo "    sudo DB_PASS='senha' ADMIN_INITIAL_PASSWORD='senha' bash bootstrap-maf.sh" >&2
  echo "  Ou: git clone https://github.com/Yran-Olv/Recibo-M-A-F-Transportes.git /var/www/maf-recibos && cd /var/www/maf-recibos && sudo ./install.sh" >&2
  exit 1
fi

CMD="${1:-deploy}"
ARG2="${2:-}"

log()  { echo "==> $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
M.A.F — deploy em produção (um comando)

  ./scripts/deploy.sh [comando]

O comando deploy (padrão) faz automaticamente:
  • Cria .env se não existir (a partir de .env.production.example)
  • Gera SESSION_SECRET
  • Cria usuário/banco PostgreSQL no servidor (se ainda não existir)
  • Cria/atualiza tabelas (npm run db:init)
  • Sobe a aplicação (Docker ou systemd)

Comandos:
  deploy          Deploy completo com Docker (padrão)
  systemd         Deploy com systemd (sem Docker)
  postgres        Só criar usuário/banco PostgreSQL
  init-db         Só criar/atualizar tabelas
  check-port      Verifica se a porta está livre

Variáveis opcionais (evita perguntas):
  DB_PASS='senha_postgres'           — senha do usuário maf_user
  ADMIN_INITIAL_PASSWORD='senha'     — login admin do sistema
  INSTALL_DIR=/opt/maf-recibos
  MAF_HOST_PORT=3010

Exemplo servidor:
  DB_PASS='MinhaSenhaForte' ./scripts/deploy.sh

Depois: Nginx (scripts/nginx-maf-recibos.conf) + certbot --nginx -d dominio
EOF
}

random_hex() {
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

random_password() {
  if command -v openssl &>/dev/null; then
    openssl rand -base64 18 | tr -d '/+=' | head -c 20
  else
    head -c 16 /dev/urandom | base64 | tr -d '/+=' | head -c 20
  fi
}

set_env_var() {
  local key="$1"
  local value="$2"
  local file=".env"
  if [[ ! -f "$file" ]]; then
    echo "${key}=${value}" >>"$file"
    return
  fi
  if grep -q "^${key}=" "$file"; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN { FS="="; found=0 }
      $1==k { print k"="v; found=1; next }
      { print }
      END { if (!found) print k"="v }' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    echo "${key}=${value}" >>"$file"
  fi
}

get_env_var() {
  local key="$1"
  local default="${2:-}"
  if [[ -f .env ]] && grep -q "^${key}=" .env; then
    grep "^${key}=" .env | head -1 | cut -d= -f2-
  else
    echo "$default"
  fi
}

load_env() {
  if [[ ! -f .env ]]; then
    die "Arquivo .env ausente após preparação."
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
}

ensure_env() {
  local mode="${1:-docker}"

  if [[ ! -f .env ]]; then
    if [[ ! -f .env.production.example ]]; then
      die "Falta .env.production.example no projeto."
    fi
    log "Criando .env a partir de .env.production.example..."
    cp .env.production.example .env
    ok "Arquivo .env criado."
  fi

  local secret
  secret="$(get_env_var SESSION_SECRET)"
  if [[ -z "$secret" ]]; then
    secret="$(random_hex)"
    set_env_var SESSION_SECRET "$secret"
    ok "SESSION_SECRET gerado automaticamente."
  fi

  local admin_pass="${ADMIN_INITIAL_PASSWORD:-$(get_env_var ADMIN_INITIAL_PASSWORD)}"
  if [[ -z "$admin_pass" ]]; then
    if [[ -t 0 ]]; then
      read -rsp "Senha do usuário admin do sistema [admin123]: " admin_pass
      echo ""
    fi
    admin_pass="${admin_pass:-admin123}"
    set_env_var ADMIN_INITIAL_PASSWORD "$admin_pass"
    ok "ADMIN_INITIAL_PASSWORD definido no .env"
  fi

  if [[ "$mode" == "systemd" ]]; then
    set_env_var PGHOST "127.0.0.1"
    set_env_var HOST "127.0.0.1"
  else
    set_env_var PGHOST "host.docker.internal"
    set_env_var HOST "0.0.0.0"
  fi

  set_env_var NODE_ENV "production"
  [[ -z "$(get_env_var MAF_HOST_PORT)" ]] && set_env_var MAF_HOST_PORT "3010"
  [[ -z "$(get_env_var PORT)" ]] && set_env_var PORT "3000"
  [[ -z "$(get_env_var PGPORT)" ]] && set_env_var PGPORT "5432"
  [[ -z "$(get_env_var PGUSER)" ]] && set_env_var PGUSER "maf_user"
  [[ -z "$(get_env_var PGDATABASE)" ]] && set_env_var PGDATABASE "maf_recibos"
}

postgres_can_connect() {
  local host="${1:-127.0.0.1}"
  local port="${2:-5432}"
  local user="${3:-maf_user}"
  local db="${4:-maf_recibos}"
  local pass="${5:-}"

  if ! command -v psql &>/dev/null; then
    return 1
  fi
  PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$db" -c "SELECT 1" &>/dev/null
}

ensure_postgres() {
  load_env

  local db_name="${PGDATABASE:-maf_recibos}"
  local db_user="${PGUSER:-maf_user}"
  local db_pass="${DB_PASS:-${PGPASSWORD:-$(get_env_var PGPASSWORD)}}"

  if [[ -n "$db_pass" ]] && postgres_can_connect "127.0.0.1" "${PGPORT:-5432}" "$db_user" "$db_name" "$db_pass"; then
    ok "PostgreSQL já acessível (${db_user}@${db_name})."
    set_env_var PGPASSWORD "$db_pass"
    return 0
  fi

  local generated_pass=0
  if [[ -z "$db_pass" ]]; then
    if [[ -n "${DB_PASS:-}" ]]; then
      db_pass="$DB_PASS"
    elif [[ -t 0 ]]; then
      read -rsp "Senha do PostgreSQL para o usuário ${db_user} (nova instalação): " db_pass
      echo ""
      [[ -z "$db_pass" ]] && die "Senha do banco não pode ser vazia."
    else
      db_pass="$(random_password)"
      generated_pass=1
      warn "Sem terminal: senha do banco gerada automaticamente (veja abaixo)."
    fi
    set_env_var PGPASSWORD "$db_pass"
    load_env
  fi

  log "Configurando PostgreSQL (usuário ${db_user}, banco ${db_name})..."
  setup_postgres

  if ! postgres_can_connect "127.0.0.1" "${PGPORT:-5432}" "$db_user" "$db_name" "$db_pass"; then
    die "Não foi possível conectar ao PostgreSQL após a configuração. Verifique pg_hba.conf e PGPASSWORD no .env"
  fi

  if [[ "$generated_pass" -eq 1 ]]; then
    echo ""
    warn "Senha do PostgreSQL (já gravada em .env como PGPASSWORD):"
    echo "  ${db_pass}"
    echo ""
  fi
}

setup_postgres() {
  local db_name="${PGDATABASE:-maf_recibos}"
  local db_user="${PGUSER:-maf_user}"
  local db_pass="${PGPASSWORD:-$(get_env_var PGPASSWORD)}"

  if [[ -z "$db_pass" ]]; then
    die "PGPASSWORD vazio. Rode o deploy de novo ou: DB_PASS='senha' ./scripts/deploy.sh"
  fi

  if ! command -v psql &>/dev/null; then
    if command -v apt-get &>/dev/null; then
      log "Instalando PostgreSQL..."
      sudo apt-get update -qq
      sudo apt-get install -y postgresql postgresql-contrib
    else
      die "PostgreSQL (psql) não encontrado. Instale no servidor."
    fi
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

  sudo -u postgres psql -d "$db_name" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db_user};
SQL

  if [[ -f "${ROOT}/db/schema.sql" ]]; then
    sudo -u postgres psql -d "$db_name" -v ON_ERROR_STOP=1 -f "${ROOT}/db/schema.sql" 2>/dev/null || true
  fi

  ok "PostgreSQL: usuário e banco ${db_name} prontos."
}

init_db() {
  load_env
  log "Criando/atualizando tabelas no PostgreSQL..."
  if ! command -v npx &>/dev/null; then
    die "Node/npm necessários. Rode: npm ci"
  fi
  npx tsx scripts/init-database.ts
  ok "Tabelas do sistema prontas."
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

prepare_stack() {
  local mode="${1:-docker}"

  log "=== Preparação (.env + PostgreSQL + tabelas) ==="
  ensure_env "$mode"
  ensure_postgres
  if [[ ! -d node_modules ]]; then
    log "Instalando dependências npm..."
    npm ci
  fi
  init_db
  ok "Preparação concluída."
  echo ""
}

deploy_docker() {
  prepare_stack docker
  load_env
  local host_port="${MAF_HOST_PORT:-3010}"

  log "=== Deploy Docker ==="
  check_port "$host_port" || die "Altere MAF_HOST_PORT no .env (ex.: 3011)"

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

  echo ""
  ok "Deploy concluído. Login admin: usuário admin (senha no .env ADMIN_INITIAL_PASSWORD)"
  print_nginx_next "$host_port"
}

deploy_systemd() {
  prepare_stack systemd
  load_env
  local install_dir="${INSTALL_DIR:-/opt/maf-recibos}"
  local app_port="${PORT:-3010}"

  log "=== Deploy systemd ==="
  check_port "$app_port" || die "Altere PORT no .env"

  log "Build da aplicação..."
  npm ci
  npm run build

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

  (cd "${install_dir}" && sudo -u maf npm ci --omit=dev) || (cd "${install_dir}" && sudo npm ci --omit=dev)

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

  echo ""
  ok "Deploy concluído. Login admin: usuário admin (senha no .env)"
  print_nginx_next "$app_port"
}

# --- roteamento ---
case "$CMD" in
  -h|--help|help)
    usage
    ;;
  check-port)
    load_env 2>/dev/null || true
    check_port "${ARG2:-${MAF_HOST_PORT:-3010}}"
    ;;
  postgres|setup-postgres|db-setup)
    ensure_env docker
    ensure_postgres
    ;;
  init-db|db-init|migrate)
    ensure_env docker
    init_db
    ;;
  systemd|system)
    deploy_systemd
    ;;
  docker|deploy|"")
    deploy_docker
    ;;
  *)
    echo "Comando desconhecido: $CMD"
    echo ""
    usage
    exit 1
    ;;
esac
