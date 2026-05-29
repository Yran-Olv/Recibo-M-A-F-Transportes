#!/usr/bin/env bash
# =============================================================================
# Instalação em produção a partir de um servidor vazio (ex.: você está em /var/www)
#
#   sudo bash scripts/bootstrap-production.sh
#
# Ou, se ainda não clonou o projeto (só precisa de curl + git):
#
#   cd /var/www
#   sudo curl -fsSL https://raw.githubusercontent.com/Yran-Olv/Recibo-M-A-F-Transportes/main/scripts/bootstrap-production.sh -o bootstrap-maf.sh
#   sudo bash bootstrap-maf.sh
#
# Variáveis opcionais:
#   MAF_INSTALL_DIR=/var/www/maf-recibos
#   MAF_REPO_URL=https://github.com/Yran-Olv/Recibo-M-A-F-Transportes.git
#   DB_PASS=... ADMIN_INITIAL_PASSWORD=...
# =============================================================================
set -euo pipefail

MAF_INSTALL_DIR="${MAF_INSTALL_DIR:-/var/www/maf-recibos}"
MAF_REPO_URL="${MAF_REPO_URL:-https://github.com/Yran-Olv/Recibo-M-A-F-Transportes.git}"
MAF_BRANCH="${MAF_BRANCH:-main}"

log()  { echo "==> $*"; }
ok()   { echo "✓ $*"; }
die()  { echo "✗ $*" >&2; exit 1; }

as_root() {
  if [[ "${EUID:-0}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_apt_packages() {
  if ! command -v apt-get &>/dev/null; then
    die "Este bootstrap automático suporta Ubuntu/Debian (apt). Instale git, node 20+, docker e clone o repo manualmente."
  fi
  log "Pacotes do sistema (git, curl, build tools)..."
  as_root apt-get update -qq
  as_root apt-get install -y -qq git curl ca-certificates gnupg lsb-release
}

node_ok() {
  command -v node &>/dev/null || return 1
  local major
  major="$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  [[ "${major:-0}" -ge 18 ]]
}

install_node() {
  if node_ok; then
    ok "Node.js $(node -v)"
    return 0
  fi
  log "Instalando Node.js 20..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | as_root bash -
    as_root apt-get install -y -qq nodejs
  else
    die "Instale Node.js 18+ manualmente."
  fi
  ok "Node.js $(node -v)"
}

install_docker() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    ok "Docker já instalado"
    return 0
  fi
  log "Instalando Docker..."
  if command -v apt-get &>/dev/null; then
    as_root apt-get install -y -qq docker.io docker-compose-plugin 2>/dev/null \
      || as_root apt-get install -y -qq docker.io docker-compose-v2 2>/dev/null \
      || as_root apt-get install -y -qq docker.io
    as_root systemctl enable --now docker 2>/dev/null || true
  else
    die "Instale Docker manualmente."
  fi
  ok "Docker pronto"
}

clone_or_update_repo() {
  local parent dir
  parent="$(dirname "$MAF_INSTALL_DIR")"
  dir="$(basename "$MAF_INSTALL_DIR")"

  as_root mkdir -p "$parent"

  if [[ -d "$MAF_INSTALL_DIR/.git" ]]; then
    log "Atualizando repositório em ${MAF_INSTALL_DIR}..."
    git -C "$MAF_INSTALL_DIR" fetch origin "$MAF_BRANCH" --quiet
    git -C "$MAF_INSTALL_DIR" checkout "$MAF_BRANCH" --quiet 2>/dev/null || true
    git -C "$MAF_INSTALL_DIR" pull --ff-only origin "$MAF_BRANCH" --quiet || true
  elif [[ -d "$MAF_INSTALL_DIR" ]]; then
    die "${MAF_INSTALL_DIR} existe mas não é um clone git. Remova ou use outro MAF_INSTALL_DIR."
  else
    log "Clonando ${MAF_REPO_URL} → ${MAF_INSTALL_DIR}..."
    git clone --branch "$MAF_BRANCH" --depth 1 "$MAF_REPO_URL" "$MAF_INSTALL_DIR"
  fi

  if [[ ! -f "${MAF_INSTALL_DIR}/install.sh" ]]; then
    die "Clone incompleto (falta install.sh). Verifique o repositório no GitHub."
  fi
  ok "Código em ${MAF_INSTALL_DIR}"
}

run_install() {
  cd "$MAF_INSTALL_DIR"
  chmod +x install.sh scripts/*.sh 2>/dev/null || true

  log "Executando install.sh (env + PostgreSQL + Docker)..."
  DB_PASS="${DB_PASS:-}" ADMIN_INITIAL_PASSWORD="${ADMIN_INITIAL_PASSWORD:-}" \
    bash ./install.sh "$@"
}

# Se este script foi baixado com curl (não está dentro do repo), só clonar e reexecutar do clone
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/$(basename "${BASH_SOURCE[0]}")" || SCRIPT_PATH="$0"
if [[ ! -f "$(dirname "$SCRIPT_PATH")/../install.sh" ]] && [[ ! -f "./install.sh" ]]; then
  log "Bootstrap remoto — preparando ${MAF_INSTALL_DIR}"
  install_apt_packages
  install_node
  install_docker
  clone_or_update_repo
  exec bash "${MAF_INSTALL_DIR}/scripts/bootstrap-production.sh" --from-clone "$@"
fi

# Rodando de dentro do repositório (após clone)
[[ "${1:-}" == "--from-clone" ]] && shift

install_apt_packages
install_node
install_docker
clone_or_update_repo
run_install
