provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

data "google_container_cluster" "primary" {
  name     = var.gke_cluster_name
  location = var.gke_location
  project  = var.gcp_project
}

data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = "https://${data.google_container_cluster.primary.endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(data.google_container_cluster.primary.master_auth[0].cluster_ca_certificate)
}
