terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
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

provider "vercel" {
  api_token = var.vercel_token
}

# ─────────────────────────────────────────
# Cloud SQL — PostgreSQL 15
# ─────────────────────────────────────────

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "argus" {
  name             = "argus-db"
  database_version = "POSTGRES_15"
  region           = var.gcp_region

  settings {
    tier              = "db-f1-micro"   # cheapest — $7/mo, fine for observability
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      transaction_log_retention_days = 3
      backup_retention_settings {
        retained_backups = 3
      }
    }

    ip_configuration {
      ipv4_enabled = true
      # Allow Vercel egress IPs (static list as of 2025 — update if needed)
      # Or restrict further: use Cloud SQL Auth Proxy + service account
      authorized_networks {
        name  = "vercel-egress"
        value = "0.0.0.0/0"  # TODO: restrict to Vercel IP ranges in production
      }
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
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

# ─────────────────────────────────────────
# Vercel Project
# ─────────────────────────────────────────

resource "vercel_project" "argus" {
  name      = "argus"
  framework = "nextjs"

  git_repository = {
    type = "github"
    repo = "osynt-labs/argus"
  }
}

locals {
  db_host = google_sql_database_instance.argus.public_ip_address
  db_url  = "postgresql://argus:${random_password.db_password.result}@${local.db_host}/argus?sslmode=require"
}

resource "vercel_project_environment_variable" "database_url" {
  project_id = vercel_project.argus.id
  key        = "DATABASE_URL"
  value      = local.db_url
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "setup_secret" {
  project_id = vercel_project.argus.id
  key        = "SETUP_SECRET"
  value      = var.setup_secret
  target     = ["production", "preview"]
  sensitive  = true
}

# ─────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────

output "db_instance_name" {
  value = google_sql_database_instance.argus.name
}

output "db_public_ip" {
  value = google_sql_database_instance.argus.public_ip_address
}

output "db_connection_name" {
  value = google_sql_database_instance.argus.connection_name
}

output "vercel_url" {
  value = "https://argus-osynt.vercel.app"
}

output "db_password" {
  value     = random_password.db_password.result
  sensitive = true
}
