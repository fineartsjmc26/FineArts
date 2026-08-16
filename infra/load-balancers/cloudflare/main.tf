terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 4.0.0, < 6.0.0"
    }
  }
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (editing: load balancing, DNS)"
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Cloudflare zone ID of the domain you control"
  type        = string
}

variable "zone_name" {
  description = "Zone domain name, e.g. finearts.edu"
  type        = string
}

variable "hostname" {
  description = "Hostname where the load balancer will be exposed, e.g. attendance.finearts.edu"
  type        = string
}

variable "origin_host" {
  description = "GitHub Pages origin hostname that serves the app"
  type        = string
  default     = "fineartsjmc26.github.io"
}

variable "origin_path" {
  description = "Path prefix on the origin, e.g. /FineArts/"
  type        = string
  default     = "/FineArts/"
}

variable "origin_port" {
  description = "Origin HTTPS port"
  type        = number
  default     = 443
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ---------------------------------------------------------------------------
# Origin pool — one GitHub Pages origin (the real backend)
# ---------------------------------------------------------------------------
resource "cloudflare_load_balancer_pool" "github_pages" {
  name                = "attendance-github-pages-pool"
  description         = "GitHub Pages origin hosting the attendance web app"
  check_regions       = ["WNAM", "ENAM", "WEU", "EAU"]
  minimum_origins     = 1
  monitor             = cloudflare_load_balancer_monitor.github_pages.id

  origin {
    name    = "github-pages-finearts"
    address = var.origin_host
    enabled = true

    # Fixed HTTP(S) monitor used by the LB for health checks
    header {
      header = "Host"
      values = [var.origin_host]
    }
  }
}

# Health check for the origin
resource "cloudflare_load_balancer_monitor" "github_pages" {
  description        = "HTTPS health check for GitHub Pages origin"
  type               = "https"
  method             = "GET"
  path               = "${var.origin_path}index.html"
  port               = var.origin_port
  expected_body      = "Attendance"
  follow_redirects   = true
  allow_insecure     = false
  expected_codes     = "2xx"
  timeout            = 5
  interval           = 60
  retries            = 2
  probe_zone         = var.zone_name

  header {
    header = "Host"
    values = [var.origin_host]
  }
}

# Pool <-> monitor binding is set on cloudflare_load_balancer_pool.github_pages.monitor above

# ---------------------------------------------------------------------------
# Load balancer (steering + failover) on the public hostname
# ---------------------------------------------------------------------------
resource "cloudflare_load_balancer" "attendance_lb" {
  zone_id          = var.zone_id
  name             = "attendance-load-balancer"
  fallback_pool_id = cloudflare_load_balancer_pool.github_pages.id
  default_pool_ids = [cloudflare_load_balancer_pool.github_pages.id]
  description      = "Load balancer for the attendance web app (GitHub Pages origin)"

  # Round-robin across pool origins; add more pools here for real scaling
  steering_policy = "random"

  # Region steering — serve nearest healthy pool (single pool here)
  country_pools {
    country_code = "*"
    pool_ids     = [cloudflare_load_balancer_pool.github_pages.id]
  }

  session_affinity        = "none"
  ttl                     = 30
  enabled                 = true
}

# CNAME record pointing the hostname at the load balancer
resource "cloudflare_record" "attendance_lb" {
  zone_id = var.zone_id
  name    = var.hostname
  content = "${var.hostname}.cdn.cloudflare.net"
  type    = "CNAME"
  proxied = true
}