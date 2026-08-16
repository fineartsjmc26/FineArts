CI/CD Integration for Terraform Load Balancers

Overview
This repository includes provider-specific GitHub Actions workflows for provisioning load balancers via Terraform:
- `.github/workflows/terraform-aws.yml`
- `.github/workflows/terraform-gcp.yml`
- `.github/workflows/terraform-azure.yml`

Workflows
- Each workflow supports `workflow_dispatch` with an `action` input: `plan` or `apply`.
- The `plan` job runs immediately and uploads a plan artifact.
- The `apply` job only runs when `action` is `apply` and requires approval via a GitHub Environment named `<provider>-production` (e.g., `aws-production`).

Required GitHub Secrets
Store the following secrets in your repository settings -> Secrets and variables -> Actions.

AWS
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (e.g., `us-east-1`)
- `AWS_VPC_ID` (used to generate tfvars)
- `AWS_PUBLIC_SUBNET_IDS` (a comma-separated quoted list, e.g. '"\"subnet-1\",\"subnet-2\""' to preserve quotes in workflows)
- `AWS_ALB_SG` (security group id)
- `AWS_INSTANCE_IDS` (comma-separated quoted list)

GCP
- `GCP_CREDENTIALS` (service account JSON)
- `GCP_PROJECT`
- `GCP_REGION`
- `GCP_INSTANCE_GROUP_SELF_LINK`

Azure
- `AZURE_CREDENTIALS` (service principal JSON from `az ad sp create-for-rbac --sdk-auth`)
- `AZURE_RG_NAME`
- `AZURE_LOCATION`
- `AZURE_APPGW_SUBNET_ID`
- `AZURE_BACKEND_IPS` (comma-separated quoted list)

Terraform Cloud (optional)
- `TF_API_TOKEN` if using Terraform Cloud for remote state or runs.

Approval flow
- Create GitHub Environments: `aws-production`, `gcp-production`, `azure-production`.
- Set required reviewers for each environment (team or users). When `apply` runs, GitHub will pause and require approval from the configured reviewers.

tfvars strategy
- The workflows write a `terraform.tfvars` file at runtime using the above secrets. Do NOT commit `terraform.tfvars` to the repository.
- Alternatively, you may store a full `TFVARS_AWS` secret and echo it into `terraform.tfvars` in the workflow.

Injecting exact IPs/subnet IDs
- Recommended: add exact IPs and subnet IDs as GitHub Secrets (e.g., `AWS_VPC_ID`, `AWS_PUBLIC_SUBNET_IDS`).
- If you want values hardcoded in the repo (NOT recommended), indicate which exact values and I will add them to the appropriate `*.tf` or `terraform.tfvars` example files.

Next steps
- Tell me which provider you want to deploy first and whether you want me to generate a `terraform.tfvars` from provided values now.
- I can also create a protected environment and show the exact approval UI steps if you want screenshots/instructions.
