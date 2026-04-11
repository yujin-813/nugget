#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-}"
BACKUP_DIR="${2:-}"

if [[ -z "${DB_PATH}" ]]; then
  echo "[ERROR] usage: $0 <db_path> [backup_dir]"
  exit 1
fi

if [[ ! -f "${DB_PATH}" ]]; then
  echo "[WARN] sqlite db not found at ${DB_PATH}; skipping backup"
  exit 0
fi

BACKUP_DIR="${BACKUP_DIR:-$(dirname "${DB_PATH}")/backups}"
mkdir -p "${BACKUP_DIR}"

timestamp="$(date +%Y%m%d-%H%M%S)"
db_name="$(basename "${DB_PATH}")"
backup_path="${BACKUP_DIR}/${db_name}.${timestamp}.bak"

cp "${DB_PATH}" "${backup_path}"
chmod 600 "${backup_path}" || true

echo "[OK] sqlite backup created: ${backup_path}"
