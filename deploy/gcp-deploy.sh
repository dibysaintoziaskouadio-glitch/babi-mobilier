#!/usr/bin/env bash
# =============================================================================
#  Déploiement de Babi Mobilier sur Google Cloud
#    Cloud Run (site) · Cloud SQL PostgreSQL 16 (base) · Secret Manager (clés)
#    Cloud Scheduler (rapprochement des paiements toutes les 2 min)
#
#  Prérequis : gcloud connecté (gcloud auth login), psql, Node 18+.
#  Usage     : ./deploy/gcp-deploy.sh <ID-du-projet> [--seed]
#    --seed  charge le catalogue de démonstration (premier déploiement seulement).
#  Relançable sans risque : chaque étape vérifie ce qui existe déjà.
#  Les clés CinetPay / WhatsApp sont lues dans apps/web/.env.local.
# =============================================================================
set -euo pipefail

PROJECT_ID="${1:?Usage : $0 <ID-du-projet> [--seed]}"
SEED="${2:-}"
REGION="${REGION:-europe-west1}"
SQL_INSTANCE="babi-db"
DB_NAME="babi"
SERVICE="babi-web"
JOB="babi-rapprochement"
PROXY_PORT=54331

PATH="$PATH:$HOME/.local/opt/google-cloud-sdk/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-40}"; }
has_secret() { gcloud secrets describe "$1" >/dev/null 2>&1; }
put_secret() { # crée le secret, ou ajoute une version si la valeur change
  local name="$1" value="$2"
  if ! has_secret "$name"; then
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
  elif [ "$(gcloud secrets versions access latest --secret="$name")" != "$value" ]; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  fi
}
secret() { gcloud secrets versions access latest --secret="$1"; }

# Valeurs CinetPay / WhatsApp de .env.local (sans exporter le reste)
envval() { (set -a; . apps/web/.env.local >/dev/null 2>&1; set +a; printf '%s' "${!1:-}"); }

# --- 1. Projet et facturation ------------------------------------------------
log "Projet $PROJECT_ID"
if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud projects create "$PROJECT_ID" --name="Babi Mobilier"
fi
gcloud config set project "$PROJECT_ID" >/dev/null
if [ "$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')" != "True" ]; then
  ACCOUNT="$(gcloud billing accounts list --filter=open=true --format='value(name)' --limit=1)"
  if [ -z "$ACCOUNT" ]; then
    echo "Aucun compte de facturation. Créez-en un : https://console.cloud.google.com/billing puis relancez." >&2
    exit 1
  fi
  gcloud billing projects link "$PROJECT_ID" --billing-account="$ACCOUNT"
fi

log "Activation des API"
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com

# --- 2. Base Cloud SQL -------------------------------------------------------
log "Cloud SQL ($SQL_INSTANCE)"
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --edition=ENTERPRISE \
    --tier=db-f1-micro --region="$REGION" --storage-size=10 --storage-auto-increase \
    --backup-start-time=03:00
fi
has_secret babi-db-owner-password || put_secret babi-db-owner-password "$(rand)"
gcloud sql users set-password postgres --instance="$SQL_INSTANCE" --password="$(secret babi-db-owner-password)" >/dev/null
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 \
  || gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"

log "Schéma (via Cloud SQL Auth Proxy)"
PROXY="$(command -v cloud-sql-proxy || true)"
if [ -z "$PROXY" ]; then
  gcloud components install cloud-sql-proxy --quiet >/dev/null 2>&1 || true
  PROXY="$(dirname "$(command -v gcloud)")/cloud-sql-proxy"
fi
"$PROXY" --gcloud-auth --port "$PROXY_PORT" "$CONN" >/tmp/babi-sql-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PROXY_PORT" >/dev/null 2>&1 && break; sleep 1; done
OWNER_URL="postgresql://postgres:$(secret babi-db-owner-password)@127.0.0.1:$PROXY_PORT/$DB_NAME"

if [ "$(psql "$OWNER_URL" -Atc "select to_regclass('public.tenants') is not null")" != "t" ]; then
  psql "$OWNER_URL" -q -v ON_ERROR_STOP=1 -f database/schema.sql \
    -f database/migrations/002_otp_challenges.sql -f database/migrations/003_users_identite.sql
fi
has_secret babi-db-app-password || put_secret babi-db-app-password "$(rand)"
APP_PW="$(secret babi-db-app-password)"
psql "$OWNER_URL" -q -c "ALTER ROLE babi_app PASSWORD '$APP_PW'"

if [ "$SEED" = "--seed" ]; then
  log "Catalogue de démonstration"
  DATABASE_URL="postgresql://babi_app:$APP_PW@127.0.0.1:$PROXY_PORT/$DB_NAME" npm run db:seed
fi
kill $PROXY_PID 2>/dev/null || true

# --- 3. Secrets --------------------------------------------------------------
log "Secret Manager"
put_secret babi-database-url "postgresql://babi_app:$APP_PW@localhost/$DB_NAME?host=/cloudsql/$CONN"
has_secret babi-session-secret || put_secret babi-session-secret "$(rand 64)"
has_secret babi-cron-secret    || put_secret babi-cron-secret "$(rand 48)"
for pair in CINETPAY_API_KEY:babi-cinetpay-api-key CINETPAY_SITE_ID:babi-cinetpay-site-id \
            CINETPAY_SECRET_KEY:babi-cinetpay-secret-key CINETPAY_TRANSFER_PASSWORD:babi-cinetpay-transfer-password \
            WHATSAPP_TOKEN:babi-whatsapp-token; do
  v="$(envval "${pair%%:*}")"; put_secret "${pair#*:}" "${v:--}"
done
SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for r in roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$r" --condition=None >/dev/null
done

# --- 4. Cloud Run ------------------------------------------------------------
log "Construction et déploiement sur Cloud Run"
URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
gcloud run deploy "$SERVICE" --source . --region="$REGION" --allow-unauthenticated \
  --add-cloudsql-instances="$CONN" --memory=512Mi --cpu=1 --min-instances=0 --max-instances=4 \
  --set-env-vars="APP_URL=${URL:-https://placeholder.invalid},DEFAULT_TENANT_SLUG=$(envval DEFAULT_TENANT_SLUG),ROOT_DOMAIN=$(envval ROOT_DOMAIN),OTP_DEV_MODE=false,WHATSAPP_OTP_TEMPLATE=$(envval WHATSAPP_OTP_TEMPLATE),WHATSAPP_PHONE_NUMBER_ID=$(envval WHATSAPP_PHONE_NUMBER_ID)" \
  --set-secrets="DATABASE_URL=babi-database-url:latest,SESSION_SECRET=babi-session-secret:latest,CRON_SECRET=babi-cron-secret:latest,CINETPAY_API_KEY=babi-cinetpay-api-key:latest,CINETPAY_SITE_ID=babi-cinetpay-site-id:latest,CINETPAY_SECRET_KEY=babi-cinetpay-secret-key:latest,CINETPAY_TRANSFER_PASSWORD=babi-cinetpay-transfer-password:latest,WHATSAPP_TOKEN=babi-whatsapp-token:latest"
NEW_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
if [ "$NEW_URL" != "$URL" ]; then
  gcloud run services update "$SERVICE" --region="$REGION" --update-env-vars="APP_URL=$NEW_URL" >/dev/null
fi

# --- 5. Cron de rapprochement des paiements ---------------------------------
log "Cloud Scheduler ($JOB)"
CRON_ARGS=(--location="$REGION" --schedule="*/2 * * * *" --time-zone="Africa/Abidjan"
  --uri="$NEW_URL/api/cron/rapprochement" --http-method=GET
  --attempt-deadline=60s)
if gcloud scheduler jobs describe "$JOB" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${CRON_ARGS[@]}" \
    --update-headers="Authorization=Bearer $(secret babi-cron-secret)" >/dev/null
else
  gcloud scheduler jobs create http "$JOB" "${CRON_ARGS[@]}" \
    --headers="Authorization=Bearer $(secret babi-cron-secret)" >/dev/null
fi

log "En ligne : $NEW_URL"
curl -s -o /dev/null -w "Page d'accueil : HTTP %{http_code}\n" "$NEW_URL/"
