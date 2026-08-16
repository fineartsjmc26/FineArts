Azure Application Gateway (Terraform example)

Overview
- Terraform sample to provision an Azure Application Gateway in front of VM scale sets or app service backends.

Requirements
- Terraform installed
- Azure subscription and service principal

Files
- `azure-appgw.tf` — example Terraform config (placeholders must be replaced).

Deploy
```bash
cd infra/load-balancers/azure
terraform init
terraform apply
```
