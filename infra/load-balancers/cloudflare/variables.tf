variable "cloudflare_api_token" {}
variable "zone_id" {}
variable "zone_name" {}
variable "hostname" {}
variable "origin_host" {
  default = "fineartsjmc26.github.io"
}
variable "origin_path" {
  default = "/FineArts/"
}
variable "origin_port" {
  default = 443
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}