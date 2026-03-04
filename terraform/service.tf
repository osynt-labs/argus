resource "kubernetes_service" "argus" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.argus.metadata[0].name
    labels    = { "app.kubernetes.io/managed-by" = "terraform" }
  }

  spec {
    selector = { "app.kubernetes.io/name" = var.app_name }

    port {
      name        = "http"
      port        = 80
      target_port = var.app_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

# LoadBalancer for external access (or use Ingress if cluster has nginx)
resource "kubernetes_service" "argus_lb" {
  metadata {
    name      = "${var.app_name}-lb"
    namespace = kubernetes_namespace.argus.metadata[0].name
    labels    = { "app.kubernetes.io/managed-by" = "terraform" }
    annotations = {
      # Internal LoadBalancer — accessible only from within GCP VPC
      # Remove this annotation for a public-facing LoadBalancer
      "cloud.google.com/load-balancer-type" = "Internal"
    }
  }

  spec {
    selector = { "app.kubernetes.io/name" = var.app_name }

    port {
      name        = "http"
      port        = 80
      target_port = var.app_port
      protocol    = "TCP"
    }

    type = "LoadBalancer"
  }
}

output "service_ip" {
  description = "Internal LoadBalancer IP (available after apply)"
  value       = try(kubernetes_service.argus_lb.status[0].load_balancer[0].ingress[0].ip, "pending")
}
