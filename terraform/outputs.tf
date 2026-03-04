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
