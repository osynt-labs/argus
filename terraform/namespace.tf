resource "kubernetes_namespace" "argus" {
  metadata {
    name   = var.namespace
    labels = { "app.kubernetes.io/managed-by" = "terraform" }
  }
}

resource "kubernetes_service_account" "argus" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.argus.metadata[0].name
    labels    = { "app.kubernetes.io/managed-by" = "terraform" }

    # Workload Identity: K8s SA → GCP SA argus-app
    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.argus_app.email
    }
  }
}
