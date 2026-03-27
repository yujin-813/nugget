#!/usr/bin/env bash
set -euo pipefail

APP_NAME="eve-event-app"
APP_ROOT="/srv/eve-event-app"
CURRENT_DIR="${APP_ROOT}/current"
ENV_FILE="${APP_ROOT}/.env.eve"
ECOSYSTEM_FILE="${CURRENT_DIR}/deploy/ecosystem.eve.config.cjs"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-eve-production}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"

if [[ ! -d "${CURRENT_DIR}" ]]; then
  echo "[ERROR] ${CURRENT_DIR} does not exist."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] ${ENV_FILE} does not exist."
  exit 1
fi

cd "${CURRENT_DIR}"

echo "[1/8] git fetch"
git fetch "${DEPLOY_REMOTE}"

echo "[2/8] git checkout ${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"

echo "[3/8] git pull"
git pull --ff-only "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"

echo "[4/8] npm ci"
npm ci

echo "[5/8] prisma db push"
set -a
source "${ENV_FILE}"
set +a
npx prisma db push
npx prisma generate

echo "[6/8] next build"
npm run build

echo "[7/8] pm2 restart"
pm2 start "${ECOSYSTEM_FILE}" --only "${APP_NAME}" --update-env
pm2 save

echo "[8/8] done"
pm2 status "${APP_NAME}"
