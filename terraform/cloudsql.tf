# =============================================================================
# Cloud SQL — PostgreSQL 15 (private, europe-west3)
# =============================================================================

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "argus" {
  name             = "argus-db"
  database_version = "POSTGRES_15"
  region           = var.gcp_region
  project          = var.gcp_project

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_size              = 10
    disk_autoresize        = true
    disk_autoresize_limit  = 50

    database_flags {
      name  = "max_connections"
      value = "50"
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    # Cloud SQL Auth Proxy connects via public IP + SSL
    # (private IP requires VPC peering setup; proxy handles auth)
    ip_configuration {
      ipv4_enabled = true
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "argus" {
  name     = "argus"
  instance = google_sql_database_instance.argus.name
  project  = var.gcp_project
}

resource "google_sql_user" "argus" {
  name     = "argus"
  instance = google_sql_database_instance.argus.name
  password = random_password.db_password.result
  project  = var.gcp_project
}

# GCP SA for the running pod (Cloud SQL client via Workload Identity)
resource "google_service_account" "argus_app" {
  project      = var.gcp_project
  account_id   = "argus-app"
  display_name = "Argus App — Cloud SQL client (Workload Identity)"
}

resource "google_project_iam_member" "argus_app_cloudsql_client" {
  project = var.gcp_project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.argus_app.email}"
}

# Allow K8s SA argus/argus to impersonate GCP SA argus-app
resource "google_service_account_iam_member" "argus_workload_identity" {
  service_account_id = google_service_account.argus_app.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.gcp_project}.svc.id.goog[${var.namespace}/${var.app_name}]"
}

output "db_instance_connection_name" {
  value = google_sql_database_instance.argus.connection_name
}
