variable "vercel_token" {
  description = "Vercel API token"
  sensitive   = true
}

variable "database_url" {
  description = "Neon PostgreSQL pooled connection URL"
  sensitive   = true
}

variable "database_url_unpooled" {
  description = "Neon PostgreSQL direct connection URL"
  sensitive   = true
}

variable "setup_secret" {
  description = "Secret for first-time API key creation"
  sensitive   = true
  default     = ""
}
