output "db_connection_name" {
  value = google_sql_database_instance.argus.connection_name
}

output "argus_app_sa_email" {
  value       = google_service_account.argus_app.email
  description = "GCP SA used by the running pod (Workload Identity)"
}

output "image_url" {
  value = "${var.image}:${var.image_tag}"
}

output "db_password" {
  value       = random_password.db_password.result
  description = "Generated password for the Cloud SQL argus user"
  sensitive   = true
}

output "db_connection_string" {
  value       = "postgresql://${google_sql_user.argus.name}:${random_password.db_password.result}@127.0.0.1:5432/${google_sql_database.argus.name}"
  description = "Full PostgreSQL connection URI (assumes Cloud SQL Auth Proxy on localhost:5432)"
  sensitive   = true
}
