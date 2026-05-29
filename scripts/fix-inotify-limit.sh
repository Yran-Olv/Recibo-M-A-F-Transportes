#!/usr/bin/env bash
# Aumenta o limite de file watchers (corrige ENOSPC no Vite/Linux).
# Execute uma vez: sudo ./scripts/fix-inotify-limit.sh

set -euo pipefail

LIMIT=524288
CONF="/etc/sysctl.d/99-inotify.conf"

echo "fs.inotify.max_user_watches=${LIMIT}" | sudo tee "$CONF"
sudo sysctl --system
echo "Limite atual:"
cat /proc/sys/fs/inotify/max_user_watches
