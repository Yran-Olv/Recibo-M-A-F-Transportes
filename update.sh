#!/usr/bin/env bash
# =============================================================================
# M.A.F — Atualização em produção (sem reinstalar tudo)
#
#   cd /var/www/maf-recibos && sudo ./update.sh
#
# Faz: git pull → dependências → migrações PostgreSQL → rebuild Docker → health
#
# Variáveis opcionais:
#   MAF_BRANCH=main          branch do git pull
#   SKIP_GIT=1               não faz git pull
#   SKIP_NGINX=1             não recarrega Nginx
#   SKIP_MIGRATE=1           não roda migrações
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
MAF_BRANCH="${MAF_BRANCH:-main}"

log()  { echo "==> $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*" >&2; }
die()  { echo "✗ $*" >&2; exit 1; }

as_root() {
  if [[ "${EUID:-0}" -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

set_env_var() {
  local key="$1" value="$2" file=".env"
  [[ -f "$file" ]] || return 0
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

repair_env_file() {
  [[ -f .env ]] || die "Falta .env — rode sudo ./install.sh na primeira vez"
  local line val
  if grep -q "^MAF_HOST_PORT=" .env; then
    line="$(grep "^MAF_HOST_PORT=" .env | head -1 | cut -d= -f2-)"
    if [[ ! "$line" =~ ^[0-9]+$ ]]; then
      val="$(printf '%s' "$line" | grep -oE '[0-9]+' | tail -1)"
      val="${val:-3012}"
      warn "MAF_HOST_PORT inválido — corrigindo para ${val}"
      set_env_var MAF_HOST_PORT "$val"
    fi
  fi
}

load_env() {
  repair_env_file
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
}

merge_new_env_keys() {
  [[ -f .env.production.example ]] || return 0
  local added=0 key line val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" == *"="* ]] || continue
    key="${line%%=*}"
    key="${key// /}"
    [[ -z "$key" ]] && continue
    if ! grep -q "^${key}=" .env 2>/dev/null; then
      val="${line#*=}"
      echo "${key}=${val}" >>.env
      warn "Nova chave no .env (do example): ${key}"
      added=$((added + 1))
    fi
  done <.env.production.example
  [[ "$added" -gt 0 ]] && ok "${added} chave(s) adicionada(s) ao .env (revise o arquivo)"
}

is_maf_health() {
  local port="$1" body
  body="$(curl -sf --max-time 5 "http://127.0.0.1:${port}/api/health" 2>/dev/null)" || return 1
  echo "$body" | grep -qE '"status"[[:space:]]*:[[:space:]]*"ok"'
}

git_update() {
  [[ "${SKIP_GIT:-0}" == "1" ]] && { warn "SKIP_GIT=1 — pulando git pull"; return 0; }
  command -v git &>/dev/null || die "git não instalado"

  if [[ ! -d .git ]]; then
    die "Pasta não é um repositório git"
  fi
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    warn "Existem alterações locais — git pull pode falhar"
  fi
  log "git pull (branch ${MAF_BRANCH})..."
  git fetch origin "$MAF_BRANCH" --quiet
  git pull --ff-only origin "$MAF_BRANCH"
  ok "Código atualizado do GitHub"
}

run_migrations() {
  [[ "${SKIP_MIGRATE:-0}" == "1" ]] && { warn "SKIP_MIGRATE=1 — pulando migrações"; return 0; }

  log "Dependências npm (para migrações)..."
  npm ci --quiet 2>/dev/null || npm ci

  log "Migrações / tabelas PostgreSQL (init-database.ts)..."
  rm -f "${ROOT}/db.json"
  if INIT_DB_STRICT=1 PGHOST=127.0.0.1 npx tsx scripts/init-database.ts; then
    ok "Banco PostgreSQL atualizado"
  else
    die "Migração falhou — confira PGHOST=127.0.0.1 e PGPASSWORD no .env"
  fi
}

docker_redeploy() {
  load_env
  local host_port="${MAF_HOST_PORT:-3010}"
  [[ "$host_port" =~ ^[0-9]+$ ]] || die "MAF_HOST_PORT inválido no .env"

  if ! command -v docker &>/dev/null; then
    die "Docker não encontrado"
  fi

  log "Rebuild e reinício do container (porta ${host_port})..."
  docker compose -f docker-compose.prod.yml up -d --build

  local health_url="http://127.0.0.1:${host_port}/api/health"
  log "Health check: ${health_url}"
  local i
  for i in $(seq 1 25); do
    if is_maf_health "$host_port"; then
      ok "M.A.F online"
      curl -sf --max-time 5 "$health_url" 2>/dev/null | head -c 200
      echo ""
      return 0
    fi
    sleep 2
  done

  warn "Health check falhou — logs:"
  docker compose -f docker-compose.prod.yml logs --tail 40
  die "Container não respondeu como M.A.F em ${host_port}"
}

reload_nginx_if_needed() {
  [[ "${SKIP_NGINX:-0}" == "1" ]] && return 0
  load_env
  local port="${MAF_HOST_PORT:-3010}"
  command -v nginx &>/dev/null || return 0

  local site="/etc/nginx/sites-available/maf-recibos"
  [[ -f "$site" ]] || { warn "Nginx maf-recibos não encontrado — pulando"; return 0; }

  log "Nginx: upstream → 127.0.0.1:${port} (mantém HTTPS do Certbot se existir)..."
  as_root sed -i "s|server 127.0.0.1:[0-9][0-9]*|server 127.0.0.1:${port}|g" "$site"
  as_root sed -i "s|proxy_pass http://127.0.0.1:[0-9][0-9]*|proxy_pass http://127.0.0.1:${port}|g" "$site"
  as_root nginx -t
  as_root systemctl reload nginx
  ok "Nginx recarregado"
}

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  M.A.F — atualização (git + banco + Docker)              ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  [[ -f package-lock.json ]] || die "Execute na pasta do projeto"
  [[ -f .env ]] || die "Falta .env — use sudo ./install.sh primeiro"

  repair_env_file
  git_update
  merge_new_env_keys
  load_env
  run_migrations
  docker_redeploy
  reload_nginx_if_needed
  load_env

  echo ""
  echo "══════════════════════════════════════════════════════════"
  ok "Atualização concluída"
  echo "  Código:     $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  echo "  Health:     http://127.0.0.1:${MAF_HOST_PORT}/api/health"
  [[ -n "${DOMAIN:-}" ]] && echo "  Site:       https://${DOMAIN}"
  echo "══════════════════════════════════════════════════════════"
  echo ""
}

main "$@"
