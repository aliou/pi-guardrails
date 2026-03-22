# Example Presets

Pre-configured presets available in the `/guardrails:settings` Examples tab. These can be applied to any config scope (global, local, or memory).

Source: [`src/commands/settings-command.ts`](../src/commands/settings-command.ts)

## File Policy Presets

### Secrets (.env)

Block dotenv-like files using glob patterns.

| Field      | Value                              |
|------------|------------------------------------|
| ID         | `example-secret-env-files`         |
| Protection | `noAccess`                         |
| Patterns   | `.env`, `.env.*`                   |
| Exceptions | `.env.example`, `*.sample.env`     |

---

### Logs (*.log)

Mark log files as read-only to prevent accidental modification.

| Field      | Value                     |
|------------|---------------------------|
| ID         | `example-log-files`       |
| Protection | `readOnly`                |
| Patterns   | `*.log`, `*.out`          |

---

### Regex env

Regex-based matching for `.env` and `.env.*` files. Demonstrates regex mode.

| Field      | Value                                    |
|------------|------------------------------------------|
| ID         | `example-regex-env`                      |
| Protection | `noAccess`                               |
| Patterns   | `^\.env(\..+)?$` (regex)                 |
| Exceptions | `^\.env\.example$` (regex)               |

---

### SSH keys

Block access to SSH private key files.

| Field      | Value                                |
|------------|--------------------------------------|
| ID         | `example-ssh-keys`                   |
| Protection | `noAccess`                           |
| Patterns   | `*.pem`, `*_rsa`, `*_ed25519`       |
| Exceptions | `*.pub`                              |

---

### AWS credentials

Block AWS CLI credentials and config files.

| Field      | Value                                  |
|------------|----------------------------------------|
| ID         | `example-aws-credentials`              |
| Protection | `noAccess`                             |
| Patterns   | `.aws/credentials`, `.aws/config`      |

---

### Database files

Mark SQLite and database files as read-only.

| Field      | Value                                  |
|------------|----------------------------------------|
| ID         | `example-database-files`               |
| Protection | `readOnly`                             |
| Patterns   | `*.db`, `*.sqlite`, `*.sqlite3`        |

---

### Kubernetes secrets

Block kubeconfig and Kubernetes secret files.

| Field      | Value                                  |
|------------|----------------------------------------|
| ID         | `example-k8s-secrets`                  |
| Protection | `noAccess`                             |
| Patterns   | `.kube/config`, `*kubeconfig*`         |

---

### Certificates

Block SSL/TLS certificate and key files.

| Field      | Value                                  |
|------------|----------------------------------------|
| ID         | `example-certificates`                 |
| Protection | `noAccess`                             |
| Patterns   | `*.crt`, `*.key`, `*.p12`              |
| Exceptions | `*.csr`                                |

---

## Dangerous Command Presets

### General

| Label              | Pattern              | Description                            |
|--------------------|----------------------|----------------------------------------|
| Homebrew           | `brew`               | Homebrew package manager               |
| git push --force   | `git push --force`   | Git force push                         |
| npm publish        | `npm publish`        | NPM package publishing                 |
| yarn publish       | `yarn publish`       | Yarn package publishing                |
| pnpm publish       | `pnpm publish`       | PNPM package publishing                |
| drop database      | `DROP DATABASE`      | SQL database drop                      |
| drop table         | `DROP TABLE`         | SQL table drop                         |

### dbt

| Label    | Pattern    | Description            |
|----------|------------|------------------------|
| dbt run  | `dbt run`  | dbt model execution    |
| dbt seed | `dbt seed` | dbt seed data loading  |

### AWS

| Label                | Pattern                        | Description                  |
|----------------------|--------------------------------|------------------------------|
| aws s3 rm            | `aws s3 rm`                    | AWS S3 object deletion       |
| aws iam              | `aws iam`                      | AWS IAM permission changes   |
| aws ec2 terminate    | `aws ec2 terminate-instances`  | AWS EC2 instance termination |

### Kubernetes

| Label          | Pattern          | Description                    |
|----------------|------------------|--------------------------------|
| kubectl delete | `kubectl delete` | Kubernetes resource deletion   |
| kubectl apply  | `kubectl apply`  | Kubernetes resource application|
| kubectl scale  | `kubectl scale`  | Kubernetes scaling operation   |

### Docker

| Label                | Pattern                | Description                              |
|----------------------|------------------------|------------------------------------------|
| Docker secrets       | `docker inspect`       | Docker inspect (may expose env vars)     |
| docker rm            | `docker rm`            | Docker container removal                 |
| docker rmi           | `docker rmi`           | Docker image removal                     |
| docker system prune  | `docker system prune`  | Docker system cleanup                    |
| docker compose down  | `docker compose down`  | Docker Compose service teardown          |

### Terraform

| Label              | Pattern              | Description                        |
|--------------------|----------------------|------------------------------------|
| Terraform apply    | `terraform apply`    | Terraform infrastructure changes   |
| Terraform destroy  | `terraform destroy`  | Terraform infrastructure destruction|
| terraform import   | `terraform import`   | Terraform resource import          |

### Google Cloud

| Label                  | Pattern                            | Description                      |
|------------------------|------------------------------------|----------------------------------|
| gcloud compute delete  | `gcloud compute instances delete`  | GCP compute instance deletion    |
| gcloud iam             | `gcloud iam`                       | GCP IAM permission changes       |
| gcloud sql delete      | `gcloud sql instances delete`      | GCP Cloud SQL instance deletion  |
