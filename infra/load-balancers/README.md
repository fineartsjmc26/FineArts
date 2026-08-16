This folder contains example configurations and deployment guidance for multiple load-balancer options.

Supported setups (examples):
- Cloudflare Load Balancer (useful for GitHub Pages / static sites)
- Nginx reverse-proxy (single VM)
- HAProxy (on VMs)
- AWS Application Load Balancer (Terraform)
- GCP HTTP(S) Load Balancer (Terraform)
- Azure Application Gateway (Terraform)

Each subfolder/file contains placeholders you must replace with real identifiers (IPs, instance IDs, account IDs, tokens).

Follow the short README in each file for quick deploy steps. These examples are non-destructive and do not change your application code.
