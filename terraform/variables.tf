variable "gcp_project_id" {
  description = "GCP project ID"
  default     = "chrome-encoder-462319-f6"
}

variable "gcp_region" {
  description = "GCP region for Cloud SQL"
  default     = "europe-west3"  # Frankfurt — same region as GKE cluster
}

variable "vercel_token" {
  description = "Vercel API token (vercel.com → Account Settings → Tokens)"
  sensitive   = true
}

variable "setup_secret" {
  description = "One-time secret for creating the first API key via /api/setup"
  sensitive   = true
}
