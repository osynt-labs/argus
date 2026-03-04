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

resource "kubernetes_ingress_v1" "argus" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.argus.metadata[0].name
    annotations = {
      "kubernetes.io/ingress.class"                = "gce"
      "cert-manager.io/cluster-issuer"             = "letsencrypt-prod"
      "acme.cert-manager.io/http01-edit-in-place"  = "true"
    }
  }

  spec {
    tls {
      hosts       = [var.domain]
      secret_name = "${var.app_name}-tls"
    }

    rule {
      host = var.domain

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.argus.metadata[0].name
              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }

  wait_for_load_balancer = false
}

output "ingress_ip" {
  description = "GCE Ingress external IP (available after apply)"
  value       = try(kubernetes_ingress_v1.argus.status[0].load_balancer[0].ingress[0].ip, "pending — run: kubectl get ingress -n argus argus")
}
