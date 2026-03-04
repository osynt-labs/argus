# =============================================================================
# Kubernetes Deployment — Argus Next.js app + Cloud SQL Auth Proxy sidecar
# =============================================================================

resource "kubernetes_deployment" "argus" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.argus.metadata[0].name
    labels = {
      "app.kubernetes.io/name"       = var.app_name
      "app.kubernetes.io/version"    = var.image_tag
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  spec {
    replicas = 1

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = 1
        max_unavailable = 0
      }
    }

    selector {
      match_labels = { "app.kubernetes.io/name" = var.app_name }
    }

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name"    = var.app_name
          "app.kubernetes.io/version" = var.image_tag
        }
      }

      spec {
        service_account_name            = kubernetes_service_account.argus.metadata[0].name
        automount_service_account_token = true

        security_context {
          run_as_non_root = true
          run_as_user     = 1001
          fs_group        = 1001
        }

        # ── Main app ──────────────────────────────────────────────
        container {
          name  = var.app_name
          image = "${var.image}:${var.image_tag}"

          port {
            name           = "http"
            container_port = var.app_port
            protocol       = "TCP"
          }

          env_from {
            secret_ref { name = kubernetes_secret.argus.metadata[0].name }
          }

          env {
            name  = "NODE_ENV"
            value = "production"
          }

          env {
            name  = "PORT"
            value = tostring(var.app_port)
          }

          resources {
            requests = {
              cpu    = var.cpu_request
              memory = var.memory_request
            }
            limits = {
              cpu    = var.cpu_limit
              memory = var.memory_limit
            }
          }

          liveness_probe {
            http_get {
              path = "/api/health"
              port = var.app_port
            }
            initial_delay_seconds = 15
            period_seconds        = 30
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/api/health"
              port = var.app_port
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 3
          }

          security_context {
            run_as_non_root            = true
            run_as_user                = 1001
            allow_privilege_escalation = false
          }

          volume_mount {
            name       = "tmp"
            mount_path = "/tmp"
          }
        }

        # ── Cloud SQL Auth Proxy sidecar ──────────────────────────
        # Connects via Workload Identity (no credentials needed)
        # App connects to 127.0.0.1:5432
        container {
          name  = "cloud-sql-proxy"
          image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14"

          args = [
            "--port=5432",
            google_sql_database_instance.argus.connection_name,
          ]

          resources {
            requests = {
              cpu    = "10m"
              memory = "32Mi"
            }
            limits = {
              cpu    = "100m"
              memory = "128Mi"
            }
          }

          security_context {
            run_as_non_root            = true
            allow_privilege_escalation = false
          }
        }

        volume {
          name = "tmp"
          empty_dir { medium = "Memory" }
        }
      }
    }
  }

  wait_for_rollout = true

  depends_on = [
    kubernetes_namespace.argus,
    kubernetes_secret.argus,
  ]
}
