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
#   sudo ./install.sh --reconfigure   (perguntas de novo; Enter = manter .env)
#   sudo ./install.sh --app-only        (só Docker + Nginx + Certbot; banco já OK)
#   Não use: sudo -t ./install.sh --reconfigure (sudo trata --reconfigure como opção dele)
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

# sudo costuma fechar stdin — ler do terminal real
has_tty() {
  [[ -t 0 ]] || [[ -r /dev/tty ]]
}

read_tty() {
  local __var="$1" __prompt="$2" __secret="${3:-0}" __input=""
  if [[ "$__secret" == "1" ]]; then
    if [[ -r /dev/tty ]]; then
      read -rsp "$__prompt" __input </dev/tty
      echo "" >/dev/tty
    else
      read -rsp "$__prompt" __input
      echo ""
    fi
  else
    if [[ -r /dev/tty ]]; then
      read -rp "$__prompt" __input </dev/tty
    else
      read -rp "$__prompt" __input
    fi
  fi
  printf -v "$__var" '%s' "$__input"
}

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
  if has_tty; then
    read_tty input "${prompt_text}${default:+ [$default]}: " 0
    input="${input:-$default}"
    eval "$var_name=\$input"
  elif [[ -n "$default" ]]; then
    eval "$var_name=\$default"
  fi
}

# Enter = mantém valor do .env; digite novo para alterar
prompt_env_keep_or_change() {
  local var_name="$1" prompt_text="$2" is_secret="${3:-0}"
  local current="${!var_name:-}"
  current="$(get_env_var "$var_name")"
  if ! env_value_is_real "$current"; then
    current=""
  fi
  if ! has_tty; then
    [[ -n "$current" ]] && eval "$var_name=\$current"
    return 0
  fi
  local input=""
  if [[ "$is_secret" == "1" ]]; then
    if [[ -n "$current" ]]; then
      read_tty input "${prompt_text} [Enter = manter atual]: " 1
    else
      read_tty input "${prompt_text}: " 1
    fi
  else
    if [[ -n "$current" ]]; then
      read_tty input "${prompt_text} [${current}] (Enter = manter): " 0
    else
      read_tty input "${prompt_text}: " 0
    fi
  fi
  if [[ -n "$input" ]]; then
    eval "$var_name=\$input"
  elif [[ -n "$current" ]]; then
    eval "$var_name=\$current"
  fi
}

ensure_env() {
  if [[ ! -f .env ]]; then
    [[ -f .env.production.example ]] || die "Falta .env.production.example"
    log "Criando .env..."
    cp .env.production.example .env
  fi

  if [[ "${MAF_RECONFIGURE:-0}" == "1" ]]; then
    warn "Modo --reconfigure: confirme ou altere cada valor (Enter = manter)."
  fi

  local secret
  secret="$(get_env_var SESSION_SECRET)"
  if [[ -z "$secret" ]]; then
    set_env_var SESSION_SECRET "$(random_hex)"
    ok "SESSION_SECRET gerado"
  fi

  echo ""
  log "Site público (Nginx + HTTPS)"
  DOMAIN="${DOMAIN:-}"
  CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
  if [[ "${MAF_RECONFIGURE:-0}" == "1" ]] || has_tty; then
    prompt_env_keep_or_change DOMAIN "Domínio (ex. recibos.minhaempresa.com.br)"
    prompt_env_keep_or_change CERTBOT_EMAIL "E-mail Certbot / Let's Encrypt"
  else
    DOMAIN="$(get_env_var DOMAIN)"
    CERTBOT_EMAIL="$(get_env_var CERTBOT_EMAIL)"
    prompt_if_empty DOMAIN "Domínio"
    prompt_if_empty CERTBOT_EMAIL "E-mail Certbot"
  fi
  [[ -n "$DOMAIN" ]] && set_env_var DOMAIN "$DOMAIN"
  [[ -n "$CERTBOT_EMAIL" ]] && set_env_var CERTBOT_EMAIL "$CERTBOT_EMAIL"
  [[ -n "$DOMAIN" ]] && set_env_var APP_URL "https://${DOMAIN}"
  echo ""

  log "Senhas do sistema"
  DB_PASS="${DB_PASS:-}"
  ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-}"
  if [[ "${MAF_RECONFIGURE:-0}" == "1" ]] || has_tty; then
    prompt_env_keep_or_change DB_PASS "Senha PostgreSQL (usuário maf_user)" 1
    prompt_env_keep_or_change ADMIN_INITIAL_PASSWORD "Senha login admin do sistema" 1
  else
    DB_PASS="${DB_PASS:-$(get_env_var PGPASSWORD)}"
    ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-$(get_env_var ADMIN_INITIAL_PASSWORD)}"
  fi
  if [[ -z "$DB_PASS" ]]; then
    DB_PASS="$(random_password)"
    warn "Senha PostgreSQL gerada (salva no .env)"
  fi
  set_env_var PGPASSWORD "$DB_PASS"
  ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-admin123}"
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

postgres_wrong_owner_count() {
  local db_name="$1"
  local db_user="$2"
  run_as_postgres psql -d "$db_name" -tAc \
    "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner IS DISTINCT FROM '${db_user}'" \
    | tr -d '[:space:]'
}

postgres_reset_public_schema() {
  local db_name="$1"
  local db_user="$2"
  warn "Recriando banco (schema public) — tabelas passam a ser do usuário ${db_user}."
  run_as_postgres psql -d "$db_name" -v ON_ERROR_STOP=1 <<SQL
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION ${db_user};
GRANT ALL ON SCHEMA public TO ${db_user};
GRANT USAGE ON SCHEMA public TO public;
SQL
  ok "Schema public recriado (vazio, pronto para init-database)"
}

postgres_fix_ownership() {
  local db_name="$1"
  local db_user="$2"
  log "Ajustando dono das tabelas para ${db_user}..."
  run_as_postgres psql -d "$db_name" -v ON_ERROR_STOP=1 <<SQL
ALTER DATABASE ${db_name} OWNER TO ${db_user};
ALTER SCHEMA public OWNER TO ${db_user};
GRANT ALL ON SCHEMA public TO ${db_user};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${db_user};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db_user};
REASSIGN OWNED BY postgres TO ${db_user};
DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yrandev') THEN
    EXECUTE 'REASSIGN OWNED BY yrandev TO ${db_user}';
  END IF;
END \$\$;
DO \$\$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO ${db_user}', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ${db_user}', r.sequencename);
  END LOOP;
END
\$\$;
SQL

  local wrong
  wrong="$(postgres_wrong_owner_count "$db_name" "$db_user")"
  if [[ "${wrong:-0}" -gt 0 ]]; then
    warn "${wrong} tabela(s) ainda não pertencem a ${db_user}."
    postgres_reset_public_schema "$db_name" "$db_user"
  else
    ok "Permissões PostgreSQL (${db_user} é dono das tabelas)"
  fi
}

setup_postgres() {
  load_env
  local db_name="${PGDATABASE:-maf_recibos}"
  local db_user="${PGUSER:-maf_user}"
  local db_pass="${PGPASSWORD:-}"

  if postgres_can_connect "$db_pass"; then
    postgres_fix_ownership "$db_name" "$db_user"
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
SELECT 'CREATE DATABASE ${db_name} OWNER TO ${db_user}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db_name}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${db_name} TO ${db_user};
SQL

  run_as_postgres psql -d "$db_name" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${db_user};
SQL

  # Tabelas criadas por init-database.ts (como maf_user), não por schema.sql como postgres
  postgres_fix_ownership "$db_name" "$db_user"

  postgres_can_connect "$db_pass" || die "Falha ao conectar no PostgreSQL após setup"
  ok "PostgreSQL pronto"
}

init_tables() {
  load_env
  local db_name="${PGDATABASE:-maf_recibos}"
  local db_user="${PGUSER:-maf_user}"
  postgres_fix_ownership "$db_name" "$db_user"

  log "Tabelas do sistema..."
  npm ci
  rm -f "${ROOT}/db.json"
  # PostgreSQL no host; sem fallback para db.json durante instalação
  INIT_DB_STRICT=1 PGHOST=127.0.0.1 npx tsx scripts/init-database.ts
  ok "Banco de dados inicializado (PostgreSQL)"
}

# =============================================================================
# Docker
# =============================================================================

deploy_app() {
  load_env
  local host_port="${MAF_HOST_PORT:-3010}"
  local health_url="http://127.0.0.1:${host_port}/api/health"

  log "=== Docker (app em produção) ==="
  echo "  cd ${ROOT}"
  echo "  docker compose -f docker-compose.prod.yml up -d --build"

  if port_listening "$host_port" && ! app_healthy_on_port "$host_port"; then
    die "Porta ${host_port} ocupada por outro serviço. Ajuste MAF_HOST_PORT no .env"
  fi

  log "Build e container..."
  docker compose -f docker-compose.prod.yml up -d --build

  log "Aguardando health check (${health_url})..."
  local i body
  for i in $(seq 1 20); do
    if body="$(curl -sf "$health_url" 2>/dev/null)"; then
      ok "App respondendo: ${health_url}"
      echo "  ${body}"
      return 0
    fi
    sleep 3
  done

  warn "Health check não respondeu a tempo."
  echo "  Teste: curl -s ${health_url}"
  echo "  Logs:  docker compose -f docker-compose.prod.yml logs -f"
  return 1
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

deploy_app_and_web() {
  deploy_app || die "Docker/health falhou — corrija e rode: sudo ./install.sh --app-only"
  if [[ "${SKIP_NGINX:-0}" != "1" ]]; then
    write_nginx_site
    setup_certbot
  fi
}

main() {
  local app_only=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --reconfigure) MAF_RECONFIGURE=1; shift ;;
      --app-only) app_only=1; shift ;;
      -h|--help)
        echo "Uso: sudo ./install.sh [--reconfigure] [--app-only]"
        exit 0
        ;;
      *) die "Opção desconhecida: $1 (use --help)" ;;
    esac
  done

  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  M.A.F Espelho de Frete — instalação em produção         ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  [[ -f package-lock.json ]] || die "Execute na pasta do projeto (git clone …/maf-recibos)"

  if [[ "$app_only" -eq 1 ]]; then
    log "Modo --app-only (Docker + Nginx + Certbot)"
    [[ -f .env ]] || die "Falta .env — rode ./install.sh completo antes"
    load_env
    deploy_app_and_web
  else
    install_system_deps
    ensure_env
    load_env
    setup_postgres
    init_tables
    deploy_app_and_web
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
