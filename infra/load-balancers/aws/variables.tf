variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
}

variable "vpc_id" {
  description = "VPC id for target group"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for ALB"
  type        = list(string)
}

variable "alb_security_group" {
  description = "Security group id for ALB"
  type        = string
}

variable "instance_ids" {
  description = "List of EC2 instance IDs to attach to target group"
  type        = list(string)
}
