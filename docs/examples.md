# Example presets

Example presets are available from `/guardrails:examples`. They are defined in [`extensions/guardrails/commands/settings/examples.ts`](../extensions/guardrails/commands/settings/examples.ts).

These presets append rules or command patterns to a selected config scope. They do not replace existing config.

## File policy presets

| Label | Protection | Patterns | Exceptions |
|---|---|---|---|
| Secrets (.env) | `noAccess` | `.env`, `.env.*` | `.env.example`, `*.sample.env` |
| Logs (*.log) | `readOnly` | `*.log`, `*.out` | — |
| Regex env | `noAccess` | `^\.env(\..+)?$` regex | `^\.env\.example$` regex |
| SSH keys | `noAccess` | `*.pem`, `*_rsa`, `*_ed25519` | `*.pub` |
| AWS credentials | `noAccess` | `.aws/credentials`, `.aws/config` | — |
| Database files | `readOnly` | `*.db`, `*.sqlite`, `*.sqlite3` | — |
| Kubernetes secrets | `noAccess` | `.kube/config`, `*kubeconfig*` | — |
| Certificates | `noAccess` | `*.crt`, `*.key`, `*.p12` | `*.csr` |

## Dangerous command presets

| Label | Pattern | Description |
|---|---|---|
| Homebrew | `brew` | Homebrew package manager |
| Docker secrets | `docker inspect` | Docker inspect may expose env vars |
| Terraform apply | `terraform apply` | Terraform infrastructure changes |
| Terraform destroy | `terraform destroy` | Terraform infrastructure destruction |
| kubectl delete | `kubectl delete` | Kubernetes resource deletion |
| docker system prune | `docker system prune` | Docker system cleanup |
| git push --force | `git push --force` | Git force push |
| npm publish | `npm publish` | NPM package publishing |
| yarn publish | `yarn publish` | Yarn package publishing |
| pnpm publish | `pnpm publish` | PNPM package publishing |
| drop database | `DROP DATABASE` | SQL database drop |
| drop table | `DROP TABLE` | SQL table drop |
| dbt run | `dbt run` | dbt model execution |
| dbt seed | `dbt seed` | dbt seed data loading |
| aws s3 rm | `aws s3 rm` | AWS S3 object deletion |
| aws iam | `aws iam` | AWS IAM permission changes |
| aws ec2 terminate | `aws ec2 terminate-instances` | AWS EC2 instance termination |
| kubectl apply | `kubectl apply` | Kubernetes resource application |
| kubectl scale | `kubectl scale` | Kubernetes scaling operation |
| docker rm | `docker rm` | Docker container removal |
| docker rmi | `docker rmi` | Docker image removal |
| docker compose down | `docker compose down` | Docker Compose service teardown |
| terraform import | `terraform import` | Terraform resource import |
| gcloud compute delete | `gcloud compute instances delete` | GCP compute instance deletion |
| gcloud iam | `gcloud iam` | GCP IAM permission changes |
| gcloud sql delete | `gcloud sql instances delete` | GCP Cloud SQL instance deletion |
