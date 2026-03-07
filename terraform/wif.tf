# =============================================================================
# Workload Identity Federation — keyless GitHub Actions → GCP auth
# Mirrors openclawsint/terraform/wif.tf pattern, scoped to osynt-labs/argus
# =============================================================================

resource "google_iam_workload_identity_pool" "argus_github_pool" {
  project                   = var.gcp_project
  workload_identity_pool_id = "argus-github-pool"
  display_name              = "Argus GitHub Actions Pool"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_iam_workload_identity_pool_provider" "argus_github_provider" {
  project                            = var.gcp_project
  workload_identity_pool_id          = google_iam_workload_identity_pool.argus_github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "argus-github-provider"
  display_name                       = "Argus GitHub OIDC"

  attribute_condition = "assertion.repository in [\"osynt-labs/argus\", \"osynt-labs/web-scrapers\"]"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# CI Service Account
resource "google_service_account" "argus_github_ci" {
  project      = var.gcp_project
  account_id   = "argus-github-ci"
  display_name = "Argus GitHub Actions CI"
}

# Roles needed by CI
locals {
  ci_roles = [
    "roles/container.developer",
    "roles/storage.admin",
    "roles/secretmanager.secretAccessor",
    "roles/secretmanager.viewer",
  ]
}

resource "google_project_iam_member" "ci_roles" {
  for_each = toset(local.ci_roles)
  project  = var.gcp_project
  role     = each.value
  member   = "serviceAccount:${google_service_account.argus_github_ci.email}"
}

# Allow WIF pool to impersonate CI SA
resource "google_service_account_iam_member" "wif_sa_binding" {
  service_account_id = google_service_account.argus_github_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.argus_github_pool.name}/attribute.repository/osynt-labs/argus"
}

output "wif_provider" {
  description = "Set as WIF_PROVIDER secret in GitHub repo settings"
  value       = google_iam_workload_identity_pool_provider.argus_github_provider.name
}

output "wif_service_account_email" {
  description = "Set as WIF_SERVICE_ACCOUNT secret in GitHub repo settings"
  value       = google_service_account.argus_github_ci.email
}

# Allow web-scrapers CI to use the same WIF pool and SA
resource "google_service_account_iam_member" "wif_sa_binding_web_scrapers" {
  service_account_id = google_service_account.argus_github_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.argus_github_pool.name}/attribute.repository/osynt-labs/web-scrapers"
}
