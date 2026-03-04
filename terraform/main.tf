terraform {
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
  }
}

provider "vercel" {
  api_token = var.vercel_token
}

variable "vercel_token" { sensitive = true }
variable "vercel_team_id" { default = "" }
variable "database_url" { sensitive = true }
variable "database_url_unpooled" { sensitive = true }
variable "argus_api_key" { sensitive = true }
variable "setup_secret" { sensitive = true }

resource "vercel_project" "argus" {
  name      = "argus"
  framework = "nextjs"

  git_repository = {
    type = "github"
    repo = "osynt-labs/argus"
  }
}

resource "vercel_project_environment_variable" "database_url" {
  project_id = vercel_project.argus.id
  key        = "DATABASE_URL"
  value      = var.database_url
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "database_url_unpooled" {
  project_id = vercel_project.argus.id
  key        = "DATABASE_URL_UNPOOLED"
  value      = var.database_url_unpooled
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

output "deployment_url" {
  value = "https://${vercel_project.argus.name}.vercel.app"
}
