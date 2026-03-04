#!/usr/bin/env bash
# =============================================================================
# Argus Bootstrap Script
# Run this ONCE before the first terraform apply.
# Prerequisites: gcloud CLI logged in, correct project set.
# =============================================================================

set -euo pipefail

PROJECT="chrome-encoder-462319-f6"
REGION="europe-west3"
ALLOWED_EMAIL="itay.van.dar@gmail.com"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
prompt()  { echo -e "${YELLOW}[?]${NC} $*"; }
section() { echo -e "\n${GREEN}══ $* ══${NC}"; }

# ── 0. Verify gcloud ─────────────────────────────────────────────
section "Checking gcloud"
gcloud config set project "$PROJECT"
ACTIVE=$(gcloud config get-value account)
info "Logged in as: $ACTIVE"
info "Project: $PROJECT"

# ── 1. Enable APIs ───────────────────────────────────────────────
section "Enabling GCP APIs"
gcloud services enable \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  iam.googleapis.com \
  container.googleapis.com \
  --project="$PROJECT" --quiet
info "APIs enabled"

# ── 2. Create GCS bucket for Terraform state (if not exists) ─────
section "Terraform state bucket"
BUCKET="${PROJECT}-openclaw-terraform-state"
if gsutil ls "gs://${BUCKET}" &>/dev/null; then
  info "Bucket gs://${BUCKET} already exists"
else
  gsutil mb -p "$PROJECT" -l "$REGION" -b on "gs://${BUCKET}"
  info "Created bucket gs://${BUCKET}"
fi

# ── 3. Google OAuth credentials ──────────────────────────────────
section "Google OAuth Setup"
warn "You need to create OAuth credentials manually in the GCP Console."
echo ""
echo "  1. Go to: https://console.cloud.google.com/apis/credentials?project=${PROJECT}"
echo "  2. Click: + CREATE CREDENTIALS → OAuth 2.0 Client ID"
echo "  3. Application type: Web application"
echo "  4. Name: Argus"
echo "  5. Authorized redirect URIs:"
echo "       https://argus.osynt.ai/api/auth/callback/google"
echo "  6. Copy the Client ID and Client Secret"
echo ""
prompt "Enter Google OAuth Client ID:"
read -r GOOGLE_CLIENT_ID
prompt "Enter Google OAuth Client Secret:"
read -r -s GOOGLE_CLIENT_SECRET
echo ""

# ── 4. Create Secret Manager secrets ────────────────────────────
section "Creating GCP Secrets"

create_or_update_secret() {
  local name="$1"
  local value="$2"

  if gcloud secrets describe "$name" --project="$PROJECT" &>/dev/null; then
    warn "Secret $name already exists — adding new version"
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT"
  else
    echo -n "$value" | gcloud secrets create "$name" \
      --replication-policy=automatic \
      --data-file=- \
      --project="$PROJECT"
    info "Created secret: $name"
  fi
}

create_or_update_secret "argus-google-client-id"     "$GOOGLE_CLIENT_ID"
create_or_update_secret "argus-google-client-secret" "$GOOGLE_CLIENT_SECRET"
create_or_update_secret "argus-nextauth-secret"      "$(openssl rand -hex 32)"
create_or_update_secret "argus-setup-secret"         "$(openssl rand -hex 32)"

info "All 4 secrets created in Secret Manager"

# ── 5. Terraform bootstrap (WIF + Cloud SQL + K8s) ───────────────
section "Terraform Init & Apply"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "${SCRIPT_DIR}/../terraform" && pwd)"

cd "$TF_DIR"

terraform init \
  -backend-config="bucket=${BUCKET}" \
  -backend-config="prefix=argus"

terraform plan \
  -var="image_tag=latest" \
  -out=plan.out

echo ""
warn "Review the plan above."
prompt "Apply? (yes/no)"
read -r CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."; exit 0
fi

terraform apply -auto-approve plan.out

# ── 6. Print GitHub secrets ──────────────────────────────────────
section "GitHub Secrets (add to osynt-labs/argus)"
WIF_PROVIDER=$(terraform output -raw wif_provider 2>/dev/null || echo "check terraform output")
WIF_SA=$(terraform output -raw wif_service_account_email 2>/dev/null || echo "check terraform output")

echo ""
echo "  Go to: https://github.com/osynt-labs/argus/settings/secrets/actions"
echo ""
echo "  Add these two secrets:"
echo ""
printf "  %-25s = %s\n" "WIF_PROVIDER"      "$WIF_PROVIDER"
printf "  %-25s = %s\n" "WIF_SERVICE_ACCOUNT" "$WIF_SA"
echo ""

# ── 7. Run DB migration ──────────────────────────────────────────
section "Database Migration"
DB_URL=$(terraform output -raw db_connection_name 2>/dev/null || echo "")
warn "Prisma migrate needs to run once to create tables."
warn "Easiest via Cloud Shell (has Cloud SQL proxy built in):"
echo ""
echo "  # In Google Cloud Shell:"
echo "  git clone https://github.com/osynt-labs/argus && cd argus"
echo "  gcloud sql connect argus-db --user=argus --database=argus"
echo "  # OR via proxy:"
echo "  cloud_sql_proxy -instances=${DB_URL}=tcp:5432 &"
echo "  DATABASE_URL='postgresql://argus:PASSWORD@127.0.0.1:5432/argus' npx prisma migrate deploy"
echo ""
warn "Get DB password: cd terraform && terraform output -raw db_password | tr -d '\\n' | pbcopy"
echo ""

# ── 8. Setup first API key ───────────────────────────────────────
section "Create first API key (after deploy)"
SETUP_SECRET_VAL=$(gcloud secrets versions access latest --secret="argus-setup-secret" --project="$PROJECT" 2>/dev/null || echo "???")
echo ""
echo "  After the pod is running, run:"
echo ""
echo "  curl -X POST https://argus.osynt.ai/api/setup \\"
echo "    -H 'x-setup-secret: ${SETUP_SECRET_VAL}' \\"
echo "    -d '{\"name\": \"openclaw\"}'"
echo ""
echo "  Save the returned key — configure in OpenClaw webhook."
echo ""

info "Bootstrap complete! Push to main to trigger CI deploy."
