output "load_balancer_hostname" {
  description = "Public hostname served by the Cloudflare load balancer"
  value       = var.hostname
}

output "origin" {
  description = "Origin that the load balancer fronts"
  value       = "https://${var.origin_host}${var.origin_path}"
}

output "health_check_path" {
  description = "Path used by the load balancer health monitor"
  value       = "${var.origin_path}index.html"
}

output "status" {
  description = "Load balancer deployment status"
  value       = cloudflare_load_balancer.attendance_lb.enabled ? "deployed" : "disabled"
}