variable "rg_name" {
  description = "Resource group name"
  type = string
}

variable "location" {
  description = "Azure region"
  type = string
}

variable "appgw_subnet_id" {
  description = "Subnet ID for Application Gateway"
  type = string
}

variable "backend_ips" {
  description = "List of backend IPs or FQDNs"
  type = list(string)
}
