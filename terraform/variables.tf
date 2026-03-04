variable "gcp_project" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "europe-west3"
}

variable "gke_cluster_name" {
  description = "Existing GKE cluster name"
  type        = string
  default     = "main"
}

variable "gke_location" {
  description = "GKE cluster zone"
  type        = string
  default     = "europe-west3-a"
}

variable "namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = "argus"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "argus"
}

variable "image" {
  description = "Container image (without tag)"
  type        = string
  default     = "gcr.io/chrome-encoder-462319-f6/argus"
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

variable "app_port" {
  description = "Next.js app port"
  type        = number
  default     = 3000
}

variable "cpu_request" {
  type    = string
  default = "100m"
}

variable "memory_request" {
  type    = string
  default = "256Mi"
}

variable "cpu_limit" {
  type    = string
  default = "500m"
}

variable "memory_limit" {
  type    = string
  default = "512Mi"
}

variable "domain" {
  description = "Public domain for Argus (e.g. argus.osynt.ai)"
  type        = string
  default     = "argus.osynt.ai"
}
