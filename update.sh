#!/usr/bin/env bash
# =============================================================================
# M.A.F — Atualização em produção
#
#   cd /var/www/maf-recibos && sudo ./update.sh
#
#   git pull → npm ci → migrações PostgreSQL → Docker rebuild → Nginx
#
# Após o git pull o script reinicia a si mesmo (para usar a versão nova do update.sh).
#
#   SKIP_GIT=1 | SKIP_MIGRATE=1 | SKIP_NGINX=1 | MAF_BRANCH=main
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
MAF_BRANCH="${MAF_BRANCH:-main}"

log()  { echo "==> $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠ $*" >&2; }
die()  { echo "✗ $*" >&2; exit 1; }

trap 'die "Falha na linha ${LINENO} (código $?)"' ERR

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
  if ! source .env 2>/dev/null; then
    die "Erro ao ler .env (sintaxe inválida). Corrija o arquivo e rode de novo."
  fi
  set +a
}

merge_new_env_keys() {
  [[ -f .env.production.example ]] || return 0
  local added=0 key line
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" == *"="* ]] || continue
    key="${line%%=*}"
    key="${key// /}"
    [[ -z "$key" ]] && continue
    if ! grep -q "^${key}=" .env 2>/dev/null; then
      echo "${line}" >>.env
      warn "Nova chave no .env: ${key}"
      added=$((added + 1))
    fi
  done <.env.production.example
  if [[ "$added" -gt 0 ]]; then
    ok "${added} chave(s) novas copiadas do .env.production.example"
  fi
}

is_maf_health() {
  local port="$1" body
  body="$(curl -sf --max-time 5 "http://127.0.0.1:${port}/api/health" 2>/dev/null)" || return 1
  echo "$body" | grep -qE '"status"[[:space:]]*:[[:space:]]*"ok"'
}

git_update() {
  if [[ "${SKIP_GIT:-0}" == "1" ]]; then
    warn "SKIP_GIT=1 — pulando git pull"
    return 0
  fi
  command -v git &>/dev/null || die "git não instalado"
  [[ -d .git ]] || die "Pasta não é um repositório git"

  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    warn "Há alterações locais — git pull pode falhar"
  fi

  log "Git: pull origin/${MAF_BRANCH}..."
  git fetch origin "$MAF_BRANCH" --quiet
  git pull --ff-only origin "$MAF_BRANCH"
  ok "Código atualizado ($(git rev-parse --short HEAD))"

  # O pull pode ter substituído este script — reinicia para executar a versão nova
  if [[ "${MAF_UPDATE_REEXEC:-0}" != "1" ]]; then
    log "Reiniciando update.sh (versão atualizada do repositório)..."
    export MAF_UPDATE_REEXEC=1
    export SKIP_GIT=1
    exec bash "${ROOT}/update.sh"
  fi
}

run_migrations() {
  if [[ "${SKIP_MIGRATE:-0}" == "1" ]]; then
    warn "SKIP_MIGRATE=1 — pulando migrações"
    return 0
  fi

  log "=== Banco de dados (migrações) ==="
  log "npm ci..."
  npm ci

  log "init-database.ts (cria/altera tabelas PostgreSQL)..."
  rm -f "${ROOT}/db.json"
  INIT_DB_STRICT=1 PGHOST=127.0.0.1 npx tsx scripts/init-database.ts
  ok "PostgreSQL migrado"
}

docker_redeploy() {
  log "=== Docker ==="
  load_env
  local host_port="${MAF_HOST_PORT:-3010}"
  [[ "$host_port" =~ ^[0-9]+$ ]] || die "MAF_HOST_PORT inválido no .env: ${host_port}"

  command -v docker &>/dev/null || die "Docker não instalado"

  log "docker compose -f docker-compose.prod.yml up -d --build"
  docker compose -f docker-compose.prod.yml up -d --build

  local health_url="http://127.0.0.1:${host_port}/api/health"
  log "Health check: ${health_url}"
  local i body
  for i in $(seq 1 25); do
    if body="$(curl -sf --max-time 5 "$health_url" 2>/dev/null)" && echo "$body" | grep -qE '"status"[[:space:]]*:[[:space:]]*"ok"'; then
      ok "Container M.A.F online na porta ${host_port}"
      echo "  ${body}"
      return 0
    fi
    sleep 2
  done

  docker compose -f docker-compose.prod.yml logs --tail 50
  die "Health check falhou em ${host_port}"
}

reload_nginx_if_needed() {
  if [[ "${SKIP_NGINX:-0}" == "1" ]]; then
    warn "SKIP_NGINX=1 — pulando Nginx"
    return 0
  fi

  log "=== Nginx ==="
  load_env
  local port="${MAF_HOST_PORT:-3010}"
  command -v nginx &>/dev/null || { warn "nginx não instalado"; return 0; }

  local site="/etc/nginx/sites-available/maf-recibos"
  [[ -f "$site" ]] || { warn "Arquivo ${site} não existe — pulando"; return 0; }

  as_root sed -i "s|server 127.0.0.1:[0-9][0-9]*|server 127.0.0.1:${port}|g" "$site"
  as_root sed -i "s|proxy_pass http://127.0.0.1:[0-9][0-9]*|proxy_pass http://127.0.0.1:${port}|g" "$site"
  as_root nginx -t
  as_root systemctl reload nginx
  ok "Nginx recarregado (upstream porta ${port})"
}

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  M.A.F — atualização (git + banco + Docker)              ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  [[ -f package-lock.json ]] || die "Execute na pasta do projeto (/var/www/maf-recibos)"
  [[ -f .env ]] || die "Falta .env — rode sudo ./install.sh primeiro"

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
  echo "  Commit:     $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  echo "  Health:     http://127.0.0.1:${MAF_HOST_PORT}/api/health"
  [[ -n "${DOMAIN:-}" ]] && echo "  Site:       https://${DOMAIN}"
  echo "══════════════════════════════════════════════════════════"
  echo ""
}

main "$@"
