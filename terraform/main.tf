terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# ─── Artifact Registry ───────────────────────────────────────────
resource "google_artifact_registry_repository" "argus" {
  location      = var.gcp_region
  repository_id = "argus"
  format        = "DOCKER"
  description   = "Argus observability dashboard"
}

# ─── Cloud SQL ───────────────────────────────────────────────────
resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "argus" {
  name             = "argus-db"
  database_version = "POSTGRES_15"
  region           = var.gcp_region

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    database_flags {
      name  = "max_connections"
      value = "50"
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    ip_configuration {
      ipv4_enabled    = false   # private only — no public IP
      private_network = "projects/${var.gcp_project_id}/global/networks/default"
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "argus" {
  name     = "argus"
  instance = google_sql_database_instance.argus.name
}

resource "google_sql_user" "argus" {
  name     = "argus"
  instance = google_sql_database_instance.argus.name
  password = random_password.db_password.result
}

# ─── GCP Service Account for the app ────────────────────────────
resource "google_service_account" "argus_app" {
  account_id   = "argus-app"
  display_name = "Argus App — Cloud SQL client"
}

resource "google_project_iam_member" "argus_cloudsql_client" {
  project = var.gcp_project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.argus_app.email}"
}

# Workload Identity: K8s SA → GCP SA
resource "google_service_account_iam_binding" "argus_workload_identity" {
  service_account_id = google_service_account.argus_app.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.gcp_project_id}.svc.id.goog[argus/argus]"
  ]
}

# ─── Outputs ─────────────────────────────────────────────────────
output "db_instance_connection_name" {
  value = google_sql_database_instance.argus.connection_name
}

output "db_private_ip" {
  value = google_sql_database_instance.argus.private_ip_address
}

output "artifact_registry_url" {
  value = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/argus/argus"
}

output "gcp_sa_email" {
  value = google_service_account.argus_app.email
}

output "db_password" {
  value     = random_password.db_password.result
  sensitive = true
}

output "db_connection_string" {
  value       = "postgresql://argus:${random_password.db_password.result}@127.0.0.1:5432/argus"
  sensitive   = true
  description = "Use this in K8s secret — connects via Cloud SQL Auth Proxy sidecar on localhost:5432"
}
