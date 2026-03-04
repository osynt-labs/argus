# 👁 Argus — AI Agent Observatory

Real-time observability dashboard for OpenClaw AI agent activity.
Every tool call, session, token, and error — visible in one place.

## Stack

- **App**: Next.js 15 (App Router, RSC, standalone build)
- **DB**: GCP Cloud SQL PostgreSQL 15 (db-f1-micro, ~$9/mo)
- **Deploy**: GKE (existing cluster) + Cloud SQL Auth Proxy sidecar
- **CI/CD**: GitHub Actions → Artifact Registry → GKE rolling deploy
- **IaC**: Terraform

## Architecture

```
OpenClaw → POST /api/ingest → Argus App (GKE pod) → Cloud SQL
              (API key auth)      ↕ SSE /api/live
                              Browser Dashboard
```

## Infrastructure Setup

### 1. Terraform apply
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

### 2. Create K8s secret
```bash
# Get DB password from terraform output
DB_PASS=$(terraform output -raw db_password)
DB_CONN=$(terraform output -raw db_connection_string)

kubectl create namespace argus
kubectl create secret generic argus-secrets -n argus \
  --from-literal=database-url="$DB_CONN" \
  --from-literal=setup-secret="$(openssl rand -hex 32)"
```

### 3. Run DB migration
```bash
# Port-forward to Cloud SQL proxy (or use Cloud Shell)
DATABASE_URL="$DB_CONN" npx prisma migrate deploy
```

### 4. Deploy K8s manifests
```bash
kubectl apply -f k8s/
```

### 5. Create first API key
```bash
curl -X POST https://argus.osynt.ai/api/setup \
  -H "x-setup-secret: YOUR_SETUP_SECRET" \
  -d '{"name": "openclaw"}'
# → {"key": "argus_xxxx..."}  — store this!
```

### 6. Configure OpenClaw hook
In `openclaw.json`, add under `hooks`:
```json
{
  "hooks": {
    "onToolCall": {
      "url": "https://argus.osynt.ai/api/ingest",
      "headers": { "Authorization": "Bearer argus_xxxx..." }
    }
  }
}
```

## Local Development

```bash
cp .env.example .env.local
# Fill in DATABASE_URL
npx prisma migrate dev
npm run dev
```
