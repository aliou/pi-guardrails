import type {
  DangerousPattern,
  GuardrailsConfig,
  PolicyRule,
} from "../../../../src/shared/config";
import { toKebabCase } from "./utils";

export const POLICY_EXAMPLES: Array<{
  label: string;
  description: string;
  rule: PolicyRule;
}> = [
  {
    label: "Secrets (.env)",
    description: "Block dotenv-like files (glob)",
    rule: {
      id: "example-secret-env-files",
      name: "Secret env files",
      description: "Block .env files and variants",
      patterns: [{ pattern: ".env" }, { pattern: ".env.*" }],
      allowedPatterns: [
        { pattern: ".env.example" },
        { pattern: "*.sample.env" },
      ],
      protection: "noAccess",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "Logs (*.log)",
    description: "Mark log files read-only (glob)",
    rule: {
      id: "example-log-files",
      name: "Log files",
      description: "Treat log files as read-only",
      patterns: [{ pattern: "*.log" }, { pattern: "*.out" }],
      protection: "readOnly",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "Regex env",
    description: "Regex match for .env and .env.*",
    rule: {
      id: "example-regex-env",
      name: "Regex env files",
      description: "Regex example for env files",
      patterns: [{ pattern: "^\\.env(\\..+)?$", regex: true }],
      allowedPatterns: [{ pattern: "^\\.env\\.example$", regex: true }],
      protection: "noAccess",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "SSH keys",
    description: "Block access to SSH private keys",
    rule: {
      id: "example-ssh-keys",
      name: "SSH keys",
      description: "Block SSH private key files",
      patterns: [
        { pattern: "*.pem" },
        { pattern: "*_rsa" },
        { pattern: "*_ed25519" },
      ],
      allowedPatterns: [{ pattern: "*.pub" }],
      protection: "noAccess",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "AWS credentials",
    description: "Block AWS CLI credentials file",
    rule: {
      id: "example-aws-credentials",
      name: "AWS credentials",
      description: "Block AWS credentials and config files",
      patterns: [{ pattern: ".aws/credentials" }, { pattern: ".aws/config" }],
      protection: "noAccess",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "Database files",
    description: "Mark SQLite/DB files read-only",
    rule: {
      id: "example-database-files",
      name: "Database files",
      description: "Protect database files from modification",
      patterns: [
        { pattern: "*.db" },
        { pattern: "*.sqlite" },
        { pattern: "*.sqlite3" },
      ],
      protection: "readOnly",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "Kubernetes secrets",
    description: "Block kubeconfig and k8s secrets",
    rule: {
      id: "example-k8s-secrets",
      name: "Kubernetes secrets",
      description: "Block kubectl config and secrets",
      patterns: [{ pattern: ".kube/config" }, { pattern: "*kubeconfig*" }],
      protection: "noAccess",
      onlyIfExists: true,
      enabled: true,
    },
  },
  {
    label: "Certificates",
    description: "Block SSL/TLS certificate files",
    rule: {
      id: "example-certificates",
      name: "Certificates",
      description: "Block certificate and key files",
      patterns: [
        { pattern: "*.crt" },
        { pattern: "*.key" },
        { pattern: "*.p12" },
      ],
      allowedPatterns: [{ pattern: "*.csr" }],
      protection: "noAccess",
      onlyIfExists: true,
      enabled: true,
    },
  },
];

export const COMMAND_EXAMPLES: Array<{
  label: string;
  description: string;
  pattern: DangerousPattern;
}> = [
  {
    label: "Homebrew",
    description: "Block brew commands (use Nix instead)",
    pattern: { pattern: "brew", description: "Homebrew package manager" },
  },
  {
    label: "Docker secrets",
    description: "Block docker commands that may expose environment secrets",
    pattern: {
      pattern: "docker inspect",
      description: "Docker inspect (may expose env vars)",
    },
  },
  {
    label: "Terraform apply",
    description: "Require confirmation for infrastructure changes",
    pattern: {
      pattern: "terraform apply",
      description: "Terraform infrastructure changes",
    },
  },
  {
    label: "Terraform destroy",
    description: "Require confirmation for infrastructure destruction",
    pattern: {
      pattern: "terraform destroy",
      description: "Terraform infrastructure destruction",
    },
  },
  {
    label: "kubectl delete",
    description: "Require confirmation for k8s resource deletion",
    pattern: {
      pattern: "kubectl delete",
      description: "Kubernetes resource deletion",
    },
  },
  {
    label: "docker system prune",
    description: "Require confirmation for Docker cleanup",
    pattern: {
      pattern: "docker system prune",
      description: "Docker system cleanup",
    },
  },
  {
    label: "git push --force",
    description: "Require confirmation for force push",
    pattern: { pattern: "git push --force", description: "Git force push" },
  },
  {
    label: "npm publish",
    description: "Require confirmation for package publishing",
    pattern: { pattern: "npm publish", description: "NPM package publishing" },
  },
  {
    label: "yarn publish",
    description: "Require confirmation for package publishing",
    pattern: {
      pattern: "yarn publish",
      description: "Yarn package publishing",
    },
  },
  {
    label: "pnpm publish",
    description: "Require confirmation for package publishing",
    pattern: {
      pattern: "pnpm publish",
      description: "PNPM package publishing",
    },
  },
  {
    label: "drop database",
    description: "Require confirmation for database drops",
    pattern: { pattern: "DROP DATABASE", description: "SQL database drop" },
  },
  {
    label: "drop table",
    description: "Require confirmation for table drops",
    pattern: { pattern: "DROP TABLE", description: "SQL table drop" },
  },
  {
    label: "dbt run",
    description: "Require confirmation for dbt model runs",
    pattern: {
      pattern: "dbt run",
      description: "dbt model execution",
    },
  },
  {
    label: "dbt seed",
    description: "Require confirmation for dbt seed data loading",
    pattern: {
      pattern: "dbt seed",
      description: "dbt seed data loading",
    },
  },
  {
    label: "aws s3 rm",
    description: "Require confirmation for AWS S3 deletions",
    pattern: {
      pattern: "aws s3 rm",
      description: "AWS S3 object deletion",
    },
  },
  {
    label: "aws iam",
    description: "Require confirmation for AWS IAM changes",
    pattern: {
      pattern: "aws iam",
      description: "AWS IAM permission changes",
    },
  },
  {
    label: "aws ec2 terminate",
    description: "Require confirmation for EC2 instance termination",
    pattern: {
      pattern: "aws ec2 terminate-instances",
      description: "AWS EC2 instance termination",
    },
  },
  {
    label: "kubectl apply",
    description: "Require confirmation for k8s resource application",
    pattern: {
      pattern: "kubectl apply",
      description: "Kubernetes resource application",
    },
  },
  {
    label: "kubectl scale",
    description: "Require confirmation for k8s scaling operations",
    pattern: {
      pattern: "kubectl scale",
      description: "Kubernetes scaling operation",
    },
  },
  {
    label: "docker rm",
    description: "Require confirmation for Docker container removal",
    pattern: {
      pattern: "docker rm",
      description: "Docker container removal",
    },
  },
  {
    label: "docker rmi",
    description: "Require confirmation for Docker image removal",
    pattern: {
      pattern: "docker rmi",
      description: "Docker image removal",
    },
  },
  {
    label: "docker compose down",
    description: "Require confirmation for Docker Compose teardown",
    pattern: {
      pattern: "docker compose down",
      description: "Docker Compose service teardown",
    },
  },
  {
    label: "terraform import",
    description: "Require confirmation for Terraform resource import",
    pattern: {
      pattern: "terraform import",
      description: "Terraform resource import",
    },
  },
  {
    label: "gcloud compute delete",
    description: "Require confirmation for GCP compute instance deletion",
    pattern: {
      pattern: "gcloud compute instances delete",
      description: "GCP compute instance deletion",
    },
  },
  {
    label: "gcloud iam",
    description: "Require confirmation for GCP IAM changes",
    pattern: {
      pattern: "gcloud iam",
      description: "GCP IAM permission changes",
    },
  },
  {
    label: "gcloud sql delete",
    description: "Require confirmation for GCP SQL instance deletion",
    pattern: {
      pattern: "gcloud sql instances delete",
      description: "GCP Cloud SQL instance deletion",
    },
  },
];

export function appendPolicyRule(
  config: GuardrailsConfig | null,
  example: PolicyRule,
): GuardrailsConfig {
  const next = structuredClone(config ?? {}) as GuardrailsConfig;
  const currentRules = next.policies?.rules ?? [];

  const existingIds = new Set(currentRules.map((rule) => rule.id));
  const baseId =
    toKebabCase(example.id || example.name || "example") || "example";
  let id = baseId;
  let i = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${i}`;
    i++;
  }

  const rule = structuredClone(example);
  rule.id = id;

  next.policies = {
    ...(next.policies ?? {}),
    rules: [...currentRules, rule],
  };

  return next;
}

export function appendDangerousPattern(
  config: GuardrailsConfig | null,
  pattern: DangerousPattern,
): GuardrailsConfig {
  const next = structuredClone(config ?? {}) as GuardrailsConfig;
  const currentPatterns = next.permissionGate?.patterns ?? [];

  const existingPatterns = new Set(currentPatterns.map((p) => p.pattern));
  if (existingPatterns.has(pattern.pattern)) {
    return next;
  }

  next.permissionGate = {
    ...(next.permissionGate ?? {}),
    patterns: [...currentPatterns, structuredClone(pattern)],
  };

  return next;
}
