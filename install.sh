#!/usr/bin/env bash
# =============================================================================
# M.A.F — ÚNICO script de instalação em produção
#
#   cd /var/www/maf-recibos && sudo ./install.sh
#
# Ou do zero (clona em /var/www/maf-recibos):
#   sudo curl -fsSL https://raw.githubusercontent.com/Yran-Olv/Recibo-M-A-F-Transportes/main/install.sh -o /tmp/maf-install.sh
#   sudo DOMAIN=recibos.seudominio.com.br CERTBOT_EMAIL=admin@seudominio.com.br \
#        DB_PASS='senha_pg' ADMIN_INITIAL_PASSWORD='senha_admin' bash /tmp/maf-install.sh
#
# Variáveis (evitam perguntas):
#   DOMAIN              — domínio público (Nginx + Certbot)
#   CERTBOT_EMAIL       — e-mail Let's Encrypt
#   DB_PASS             — senha PostgreSQL (maf_user)
#   ADMIN_INITIAL_PASSWORD — senha login admin do sistema
#   MAF_INSTALL_DIR     — padrão /var/www/maf-recibos
#   SKIP_CERTBOT=1      — só HTTP, sem HTTPS
#   SKIP_NGINX=1        — não configura Nginx
# =============================================================================
set -euo pipefail

MAF_INSTALL_DIR="${MAF_INSTALL_DIR:-/var/www/maf-recibos}"
MAF_REPO_URL="${MAF_REPO_URL:-https://github.com/Yran-Olv/Recibo-M-A-F-Transportes.git}"
MAF_BRANCH="${MAF_BRANCH:-main}"
MAF_PORT_START="${MAF_PORT_START:-3010}"
MAF_PORT_END="${MAF_PORT_END:-3020}"

log()  { echo "==> $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

as_root() {
  if [[ "${EUID:-0}" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

# sudo -u postgres (não usar as_root: como root ele executaria só "-u")
run_as_postgres() {
  if [[ "${EUID:-0}" -eq 0 ]]; then
    runuser -u postgres -- "$@" 2>/dev/null || sudo -u postgres "$@"
  else
    sudo -u postgres "$@"
  fi
}

# --- Se baixou com curl (fora do repo), clona e reexecuta ---
_self="${BASH_SOURCE[0]}"
if [[ ! -f "$(dirname "$_self")/package-lock.json" ]] && [[ ! -f "./package-lock.json" ]]; then
  log "Primeira instalação — preparando ${MAF_INSTALL_DIR}"
  if command -v apt-get &>/dev/null; then
    as_root apt-get update -qq
    as_root apt-get install -y -qq git curl ca-certificates
  fi
  as_root mkdir -p "$(dirname "$MAF_INSTALL_DIR")"
  if [[ ! -d "${MAF_INSTALL_DIR}/.git" ]]; then
    git clone --branch "$MAF_BRANCH" --depth 1 "$MAF_REPO_URL" "$MAF_INSTALL_DIR"
  else
    git -C "$MAF_INSTALL_DIR" pull --ff-only origin "$MAF_BRANCH" --quiet || true
  fi
  exec bash "${MAF_INSTALL_DIR}/install.sh" "$@"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# =============================================================================
# Utilitários
# =============================================================================

random_hex() {
  command -v openssl &>/dev/null && openssl rand -hex 32 \
    || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

random_password() {
  command -v openssl &>/dev/null && openssl rand -base64 18 | tr -d '/+=' | head -c 20 \
    || head -c 16 /dev/urandom | base64 | tr -d '/+=' | head -c 20
}

set_env_var() {
  local key="$1" value="$2" file=".env"
  [[ -f "$file" ]] || touch "$file"
  if grep -q "^${key}=" "$file"; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN { found=0 }
      $0 ~ "^" k "=" { print k "=" v; found=1; next }
      { print }
      END { if (!found) print k "=" v }' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    echo "${key}=${value}" >>"$file"
  fi
}

get_env_var() {
  local key="$1" default="${2:-}"
  [[ -f .env ]] && grep -q "^${key}=" .env && grep "^${key}=" .env | head -1 | cut -d= -f2- || echo "$default"
}

load_env() {
  [[ -f .env ]] || die ".env não encontrado."
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
}

# Valores de exemplo no .env.production.example — tratar como vazio e perguntar de novo
is_placeholder_value() {
  local v="${1,,}"
  [[ -z "$1" ]] && return 0
  [[ "$v" == *"seudominio"* ]] && return 0
  [[ "$v" == *"example.com"* ]] && return 0
  [[ "$v" == *"seu.dominio"* ]] && return 0
  [[ "$v" == *"changeme"* ]] && return 0
  return 1
}

env_value_is_real() {
  local v="$1"
  [[ -n "$v" ]] && ! is_placeholder_value "$v"
}

# =============================================================================
# Dependências do sistema
# =============================================================================

node_ok() {
  command -v node &>/dev/null || return 1
  local major
  major="$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  [[ "${major:-0}" -ge 18 ]]
}

install_system_deps() {
  if ! command -v apt-get &>/dev/null; then
    warn "Sem apt-get — instale manualmente: git, node 20+, docker, postgresql, nginx, certbot"
    return 0
  fi

  log "Pacotes do sistema..."
  as_root apt-get update -qq
  as_root apt-get install -y -qq git curl ca-certificates gnupg lsb-release iproute2

  if ! node_ok; then
    log "Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash -
    as_root apt-get install -y -qq nodejs
  fi
  ok "Node $(node -v)"

  if ! command -v docker &>/dev/null; then
    log "Docker..."
    as_root apt-get install -y -qq docker.io docker-compose-plugin 2>/dev/null \
      || as_root apt-get install -y -qq docker.io
    as_root systemctl enable --now docker 2>/dev/null || true
  fi
  ok "Docker"

  if ! command -v psql &>/dev/null; then
    log "PostgreSQL..."
    as_root apt-get install -y -qq postgresql postgresql-contrib
    as_root systemctl enable --now postgresql 2>/dev/null || true
  fi
  ok "PostgreSQL"

  if [[ "${SKIP_NGINX:-0}" != "1" ]]; then
    if ! command -v nginx &>/dev/null; then
      log "Nginx..."
      as_root apt-get install -y -qq nginx
      as_root systemctl enable --now nginx 2>/dev/null || true
    fi
    ok "Nginx"
    if [[ "${SKIP_CERTBOT:-0}" != "1" ]] && ! command -v certbot &>/dev/null; then
      log "Certbot..."
      as_root apt-get install -y -qq certbot python3-certbot-nginx 2>/dev/null \
        || as_root apt-get install -y -qq certbot
    fi
    ok "Certbot"
  fi
}

# =============================================================================
# Portas
# =============================================================================

port_listening() {
  local port="$1"
  if command -v ss &>/dev/null; then
    ss -tln | grep -q ":${port} "
  elif command -v lsof &>/dev/null; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -P -n &>/dev/null
  else
    return 1
  fi
}

app_healthy_on_port() {
  local port="$1"
  curl -sf "http://127.0.0.1:${port}/api/health" &>/dev/null
}

find_app_port() {
  local p saved
  saved="$(get_env_var MAF_HOST_PORT)"
  if [[ -n "$saved" ]] && { ! port_listening "$saved" || app_healthy_on_port "$saved"; }; then
    echo "$saved"
    return 0
  fi

  for ((p = MAF_PORT_START; p < MAF_PORT_END; p++)); do
    if ! port_listening "$p"; then
      echo "$p"
      return 0
    fi
    if app_healthy_on_port "$p"; then
      echo "$p"
      return 0
    fi
  done
  die "Nenhuma porta livre entre ${MAF_PORT_START} e $((MAF_PORT_END - 1))."
}

check_ports_for_nginx() {
  local p=80
  if port_listening "$p"; then
    if command -v nginx &>/dev/null && as_root nginx -t &>/dev/null 2>&1; then
      ok "Porta 80 em uso (Nginx — ok)"
    else
      warn "Porta 80 em uso por outro processo — Certbot pode falhar."
    fi
  else
    ok "Porta 80 livre"
  fi
}

# =============================================================================
# .env
# =============================================================================

prompt_if_empty() {
  local var_name="$1" prompt_text="$2" default="${3:-}"
  local current="${!var_name:-}"
  if env_value_is_real "$current"; then
    return 0
  fi
  current="$(get_env_var "$var_name")"
  if env_value_is_real "$current"; then
    eval "$var_name=\$current"
    return 0
  fi
  if [[ -t 0 ]]; then
    read -rp "$prompt_text${default:+ [$default]}: " input
    input="${input:-$default}"
    eval "$var_name=\$input"
  elif [[ -n "$default" ]]; then
    eval "$var_name=\$default"
  fi
}

ensure_env() {
  if [[ ! -f .env ]]; then
    [[ -f .env.production.example ]] || die "Falta .env.production.example"
    log "Criando .env..."
    cp .env.production.example .env
  fi

  local secret
  secret="$(get_env_var SESSION_SECRET)"
  if [[ -z "$secret" ]]; then
    set_env_var SESSION_SECRET "$(random_hex)"
    ok "SESSION_SECRET gerado"
  fi

  echo ""
  log "Site público (Nginx + HTTPS)"
  DOMAIN="${DOMAIN:-$(get_env_var DOMAIN)}"
  CERTBOT_EMAIL="${CERTBOT_EMAIL:-$(get_env_var CERTBOT_EMAIL)}"
  if ! env_value_is_real "$DOMAIN"; then DOMAIN=""; fi
  if ! env_value_is_real "$CERTBOT_EMAIL"; then CERTBOT_EMAIL=""; fi
  prompt_if_empty DOMAIN "Domínio (ex. recibos.minhaempresa.com.br)"
  prompt_if_empty CERTBOT_EMAIL "E-mail para Certbot / Let's Encrypt"
  [[ -n "$DOMAIN" ]] && set_env_var DOMAIN "$DOMAIN"
  [[ -n "$CERTBOT_EMAIL" ]] && set_env_var CERTBOT_EMAIL "$CERTBOT_EMAIL"
  [[ -n "$DOMAIN" ]] && set_env_var APP_URL "https://${DOMAIN}"
  echo ""

  log "Senhas do sistema"
  DB_PASS="${DB_PASS:-$(get_env_var PGPASSWORD)}"
  if [[ -z "$DB_PASS" ]]; then
    if [[ -t 0 ]]; then
      read -rsp "Senha PostgreSQL (usuário maf_user): " DB_PASS
      echo ""
    else
      DB_PASS="$(random_password)"
      warn "Senha PostgreSQL gerada automaticamente (salva no .env)"
    fi
  fi
  set_env_var PGPASSWORD "$DB_PASS"

  ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-$(get_env_var ADMIN_INITIAL_PASSWORD)}"
  if [[ -z "$ADMIN_INITIAL_PASSWORD" ]]; then
    if [[ -t 0 ]]; then
      read -rsp "Senha do admin do sistema [admin123]: " ADMIN_INITIAL_PASSWORD
      echo ""
    fi
    ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-admin123}"
  fi
  set_env_var ADMIN_INITIAL_PASSWORD "$ADMIN_INITIAL_PASSWORD"

  set_env_var NODE_ENV "production"
  # 127.0.0.1 no .env = scripts no host (install, db:init). Docker usa host.docker.internal no compose.
  set_env_var PGHOST "127.0.0.1"
  set_env_var HOST "0.0.0.0"
  set_env_var PORT "3000"
  set_env_var PGPORT "5432"
  set_env_var PGUSER "maf_user"
  set_env_var PGDATABASE "maf_recibos"

  local app_port
  app_port="$(find_app_port)"
  set_env_var MAF_HOST_PORT "$app_port"
  ok "Porta da aplicação: ${app_port}"
  check_ports_for_nginx
}

# =============================================================================
# PostgreSQL
# =============================================================================

postgres_can_connect() {
  PGPASSWORD="${1:-}" psql -h 127.0.0.1 -p "${PGPORT:-5432}" -U "${PGUSER:-maf_user}" \
    -d "${PGDATABASE:-maf_recibos}" -c "SELECT 1" &>/dev/null
}

setup_postgres() {
  load_env
  local db_name="${PGDATABASE:-maf_recibos}"
  local db_user="${PGUSER:-maf_user}"
  local db_pass="${PGPASSWORD:-}"

  if postgres_can_connect "$db_pass"; then
    ok "PostgreSQL já configurado"
    return 0
  fi

  log "Criando usuário e banco PostgreSQL..."
  run_as_postgres psql -v ON_ERROR_STOP=1 <<SQL
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

  run_as_postgres psql -d "$db_name" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db_user};
SQL

  [[ -f "${ROOT}/db/schema.sql" ]] && \
    run_as_postgres psql -d "$db_name" -f "${ROOT}/db/schema.sql" 2>/dev/null || true

  postgres_can_connect "$db_pass" || die "Falha ao conectar no PostgreSQL após setup"
  ok "PostgreSQL pronto"
}

init_tables() {
  load_env
  log "Tabelas do sistema..."
  npm ci
  # PostgreSQL no host Linux — não usar host.docker.internal aqui
  PGHOST=127.0.0.1 npx tsx scripts/init-database.ts
  ok "Banco de dados inicializado"
}

# =============================================================================
# Docker
# =============================================================================

deploy_app() {
  load_env
  local host_port="${MAF_HOST_PORT:-3010}"

  if ! port_listening "$host_port" || ! app_healthy_on_port "$host_port"; then
    if port_listening "$host_port" && ! app_healthy_on_port "$host_port"; then
      die "Porta ${host_port} ocupada por outro serviço. Ajuste MAF_HOST_PORT no .env"
    fi
    log "Build e container Docker (porta ${host_port})..."
    docker compose -f docker-compose.prod.yml up -d --build
  else
    log "App já rodando na porta ${host_port} — rebuild..."
    docker compose -f docker-compose.prod.yml up -d --build
  fi

  local i
  for i in $(seq 1 15); do
    if app_healthy_on_port "$host_port"; then
      ok "App: http://127.0.0.1:${host_port}/api/health"
      return 0
    fi
    sleep 2
  done
  warn "Health check demorou — veja: docker compose -f docker-compose.prod.yml logs -f"
}

# =============================================================================
# Nginx + Certbot
# =============================================================================

write_nginx_site() {
  load_env
  local domain="${DOMAIN:-}"
  local port="${MAF_HOST_PORT:-3010}"
  [[ -n "$domain" ]] || { warn "DOMAIN vazio — pulando Nginx"; return 0; }

  local site="/etc/nginx/sites-available/maf-recibos"
  log "Configurando Nginx (${domain} → 127.0.0.1:${port})..."

  as_root tee "$site" >/dev/null <<NGINX
# Gerado por install.sh — M.A.F Espelho de Frete
upstream maf_recibos_app {
    server 127.0.0.1:${port};
    keepalive 8;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    client_max_body_size 4M;

    location / {
        proxy_pass http://maf_recibos_app;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
    }
}
NGINX

  as_root ln -sf "$site" /etc/nginx/sites-enabled/maf-recibos
  as_root rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  as_root nginx -t
  as_root systemctl reload nginx
  ok "Nginx ativo para ${domain}"
}

setup_certbot() {
  load_env
  [[ "${SKIP_CERTBOT:-0}" == "1" ]] && { warn "Certbot ignorado (SKIP_CERTBOT=1)"; return 0; }

  local domain="${DOMAIN:-}"
  local email="${CERTBOT_EMAIL:-}"
  [[ -n "$domain" ]] || { warn "Sem DOMAIN — HTTPS não configurado"; return 0; }

  if ! command -v certbot &>/dev/null; then
    warn "certbot não instalado — rode depois: certbot --nginx -d ${domain}"
    return 0
  fi

  if [[ -z "$email" ]]; then
    warn "Sem CERTBOT_EMAIL — configure HTTPS manualmente: certbot --nginx -d ${domain}"
    return 0
  fi

  log "Certbot (HTTPS) para ${domain}..."
  if as_root certbot --nginx -d "$domain" \
    --non-interactive --agree-tos -m "$email" --redirect 2>/dev/null; then
    ok "HTTPS: https://${domain}"
  else
    warn "Certbot falhou (DNS apontando para este servidor? porta 80 aberta?)."
    warn "Tente depois: sudo certbot --nginx -d ${domain}"
  fi
}

# =============================================================================
# Main
# =============================================================================

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  M.A.F Espelho de Frete — instalação em produção         ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  [[ -f package-lock.json ]] || die "Execute na pasta do projeto (git clone …/maf-recibos)"

  install_system_deps
  ensure_env
  load_env
  setup_postgres
  init_tables
  deploy_app

  if [[ "${SKIP_NGINX:-0}" != "1" ]]; then
    write_nginx_site
    setup_certbot
  fi

  load_env
  echo ""
  echo "══════════════════════════════════════════════════════════"
  ok "Instalação concluída"
  echo "  App local:  http://127.0.0.1:${MAF_HOST_PORT}/api/health"
  [[ -n "${DOMAIN:-}" ]] && echo "  Site:       https://${DOMAIN}  (ou http se Certbot falhou)"
  echo "  Login:      admin / (senha em .env ADMIN_INITIAL_PASSWORD)"
  echo "  Arquivos:   ${ROOT}"
  echo "══════════════════════════════════════════════════════════"
  echo ""
}

main "$@"
