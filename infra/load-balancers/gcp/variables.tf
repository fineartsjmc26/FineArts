variable "gcp_project" {
  description = "GCP project id"
  type = string
}

variable "gcp_region" {
  description = "GCP region"
  type = string
}

variable "instance_group_self_link" {
  description = "Self-link of the instance group to use as backend"
  type = string
}
