# Terraform example for GCP HTTP(S) Load Balancer
# This is a minimal outline; replace project, region, backend instance group names, and health checks

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

# Example: create a backend service and URL map (high-level)
resource "google_compute_backend_service" "attendance_backend" {
  name                  = "attendance-backend"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  health_checks         = [google_compute_health_check.att_health.self_link]
  backend {
    group = var.instance_group_self_link
  }
}

resource "google_compute_health_check" "att_health" {
  name               = "attendance-health"
  http_health_check {
    request_path = "/_health"
    port         = 80
  }
}

# Create URL map, target proxy, forwarding rule (examples omitted for brevity). See GCP docs for full setup.
