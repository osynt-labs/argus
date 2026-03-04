# =============================================================================
# Secrets — pulled from GCP Secret Manager, injected as K8s secrets
#
# PRE-CREATE these in Secret Manager before first terraform apply:
#   gcloud secrets create argus-username       --replication-policy=automatic
#   gcloud secrets create argus-password       --replication-policy=automatic
#   gcloud secrets create argus-nextauth-secret --replication-policy=automatic
#   gcloud secrets create argus-setup-secret    --replication-policy=automatic
#
#   gcloud secrets versions add argus-username        --data-file=<(echo -n "YOUR_USERNAME")
#   gcloud secrets versions add argus-password        --data-file=<(echo -n "YOUR_STRONG_PASSWORD")
#   gcloud secrets versions add argus-nextauth-secret --data-file=<(openssl rand -hex 32)
#   gcloud secrets versions add argus-setup-secret    --data-file=<(openssl rand -hex 32)
# =============================================================================

# Terraform-managed: DB password stored in Secret Manager
resource "google_secret_manager_secret" "db_password" {
  project   = var.gcp_project
  secret_id = "argus-db-password"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# Pre-created by user
data "google_secret_manager_secret_version" "username" {
  secret  = "argus-username"
  project = var.gcp_project
}

data "google_secret_manager_secret_version" "password" {
  secret  = "argus-password"
  project = var.gcp_project
}

data "google_secret_manager_secret_version" "nextauth_secret" {
  secret  = "argus-nextauth-secret"
  project = var.gcp_project
}

data "google_secret_manager_secret_version" "setup_secret" {
  secret  = "argus-setup-secret"
  project = var.gcp_project
}

# K8s secret — all app secrets in one object
resource "kubernetes_secret" "argus" {
  metadata {
    name      = "argus-secrets"
    namespace = kubernetes_namespace.argus.metadata[0].name
    labels    = { "app.kubernetes.io/managed-by" = "terraform" }
  }

  data = {
    DATABASE_URL    = "postgresql://argus:${random_password.db_password.result}@127.0.0.1:5432/argus"
    ARGUS_USERNAME  = data.google_secret_manager_secret_version.username.secret_data
    ARGUS_PASSWORD  = data.google_secret_manager_secret_version.password.secret_data
    NEXTAUTH_SECRET = data.google_secret_manager_secret_version.nextauth_secret.secret_data
    NEXTAUTH_URL    = "https://argus.osynt.ai"
    SETUP_SECRET    = data.google_secret_manager_secret_version.setup_secret.secret_data
  }

  type = "Opaque"
}
