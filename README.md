# Argus -- AI Agent Observatory

Real-time observability dashboard for OpenClaw AI agent activity.
Every tool call, session, token, and error -- visible in one place.

## Stack

- **App**: Next.js 16 (App Router, RSC, standalone build)
- **DB**: GCP Cloud SQL PostgreSQL 15 (db-f1-micro, ~$9/mo)
- **Deploy**: GKE (existing cluster) + Cloud SQL Auth Proxy sidecar
- **CI/CD**: GitHub Actions -> GCR -> Terraform apply -> GKE rolling deploy
- **IaC**: Terraform (manages namespace, secrets, deployment, service, WIF)

## Architecture

```
OpenClaw -> POST /api/ingest -> Argus App (GKE pod) -> Cloud SQL
              (API key auth)      | SSE /api/live
                              Browser Dashboard
```

## Infrastructure Setup

Terraform manages all Kubernetes resources (namespace, secrets, deployment,
service). There are no standalone K8s manifests -- everything lives in
`terraform/`.

### 1. Run bootstrap script

The bootstrap script enables GCP APIs, creates the Terraform state bucket,
prompts for dashboard credentials, stores secrets in GCP Secret Manager,
then runs `terraform init` and `terraform apply`.

```bash
./scripts/bootstrap.sh
```

### 2. Set GitHub secrets

After bootstrap completes it prints two values. Add them as GitHub Actions
secrets so CI can authenticate via Workload Identity Federation:

| Secret               | Description                   |
|----------------------|-------------------------------|
| `WIF_PROVIDER`       | WIF pool provider resource ID |
| `WIF_SERVICE_ACCOUNT`| CI service account email      |

### 3. Run Prisma migration

Tables must be created once before the app can start. The easiest way is
via Google Cloud Shell (which has the Cloud SQL proxy built in):

```bash
# In Google Cloud Shell:
git clone https://github.com/osynt-labs/argus && cd argus
npm ci

# Option A: direct connect
gcloud sql connect argus-db --user=argus --database=argus

# Option B: via Cloud SQL proxy
cloud_sql_proxy -instances=<CONNECTION_NAME>=tcp:5432 &
DATABASE_URL='postgresql://argus:<PASSWORD>@127.0.0.1:5432/argus' npx prisma migrate deploy
```

Get the DB password:
```bash
cd terraform && terraform output -raw db_password
```

### 4. Push to main to trigger deploy

CI builds the Docker image, pushes it to GCR, and runs `terraform apply`
with the new image tag. The deployment rolls out automatically.

```bash
git push origin main
```

### 5. Create first API key

Once the pod is running, call the setup endpoint to create an ingest key:

```bash
curl -X POST https://argus.osynt.ai/api/setup \
  -H "x-setup-secret: YOUR_SETUP_SECRET" \
  -d '{"name": "openclaw"}'
# -> {"key": "argus_xxxx..."}  -- store this!
```

Retrieve the setup secret:
```bash
gcloud secrets versions access latest --secret="argus-setup-secret" \
  --project="chrome-encoder-462319-f6"
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
cp .env.example .env
# Fill in DATABASE_URL and other values (see .env.example for documentation)
npx prisma migrate dev
npm run dev
```
