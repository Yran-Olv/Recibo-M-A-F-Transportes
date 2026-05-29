#!/usr/bin/env bash
# Instalação em produção — rode DENTRO da pasta do projeto (ex.: /var/www/maf-recibos)
# Primeira vez no servidor vazio: scripts/bootstrap-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

die() { echo "✗ $*" >&2; exit 1; }
log() { echo "==> $*"; }

if [[ ! -f package.json ]]; then
  die "package.json não encontrado. Pasta errada?"
fi

if [[ ! -f package-lock.json ]]; then
  die "package-lock.json ausente. Clone o repositório completo:
  git clone https://github.com/Yran-Olv/Recibo-M-A-F-Transportes.git /var/www/maf-recibos"
fi

if [[ ! -f scripts/deploy.sh ]]; then
  die "scripts/deploy.sh ausente. Não copie só parte dos arquivos — use git clone."
fi

chmod +x scripts/deploy.sh scripts/bootstrap-production.sh 2>/dev/null || true

if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  die "Node.js/npm não instalados. No servidor: sudo bash scripts/bootstrap-production.sh (instala dependências)"
fi

log "Instalando dependências npm..."
npm ci

log "Iniciando deploy..."
exec bash scripts/deploy.sh "$@"
