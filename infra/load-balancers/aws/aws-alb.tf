# Terraform example: ALB + target group
# Replace variables and provide proper VPC/subnet ids and instance IDs

provider "aws" {
  region = var.aws_region
}

resource "aws_lb" "attendance_alb" {
  name               = "attendance-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [var.alb_security_group]
}

resource "aws_lb_target_group" "attendance_tg" {
  name     = "attendance-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = var.vpc_id
  health_check {
    path                = "/_health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    unhealthy_threshold = 2
    healthy_threshold   = 2
  }
}

resource "aws_lb_listener" "http_listener" {
  load_balancer_arn = aws_lb.attendance_alb.arn
  port              = "80"
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.attendance_tg.arn
  }
}

# Attach EC2 instances (replace with real instance IDs)
resource "aws_lb_target_group_attachment" "tg_attach" {
  count            = length(var.instance_ids)
  target_group_arn = aws_lb_target_group.attendance_tg.arn
  target_id        = var.instance_ids[count.index]
  port             = 80
}

# Variables (create a variables.tf in this folder or pass via CLI)
