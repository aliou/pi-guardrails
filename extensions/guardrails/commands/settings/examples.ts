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
    description:
      "Blocks common dotenv files that usually contain secrets, while allowing sample and example env files.",
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
    description:
      "Makes log and output files read-only so the agent can inspect them without accidentally rewriting them.",
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
    description:
      "Shows how to use regex patterns to protect .env and .env.* files with a precise exception for .env.example.",
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
    description:
      "Blocks common SSH private key formats while allowing public key files.",
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
    description:
      "Blocks AWS CLI credential and config files that may contain access keys, profiles, and account details.",
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
    description:
      "Makes SQLite and database files read-only to avoid accidental data changes.",
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
    description:
      "Blocks kubeconfig-style files that can contain cluster credentials and sensitive Kubernetes access details.",
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
    description:
      "Blocks certificate and private key files while allowing certificate signing requests.",
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
    description:
      "Prompts before Homebrew commands, useful on machines where package installs should go through Nix.",
    pattern: { pattern: "brew", description: "Homebrew package manager" },
  },
  {
    label: "Docker secrets",
    description:
      "Prompts before docker inspect because container metadata can expose environment variables and mounted secrets.",
    pattern: {
      pattern: "docker inspect",
      description: "Docker inspect (may expose env vars)",
    },
  },
  {
    label: "Terraform apply",
    description: "Prompts before Terraform applies infrastructure changes.",
    pattern: {
      pattern: "terraform apply",
      description: "Terraform infrastructure changes",
    },
  },
  {
    label: "Terraform destroy",
    description: "Prompts before Terraform destroys infrastructure resources.",
    pattern: {
      pattern: "terraform destroy",
      description: "Terraform infrastructure destruction",
    },
  },
  {
    label: "kubectl delete",
    description: "Prompts before deleting Kubernetes resources.",
    pattern: {
      pattern: "kubectl delete",
      description: "Kubernetes resource deletion",
    },
  },
  {
    label: "docker system prune",
    description:
      "Prompts before Docker cleanup commands that can remove images, containers, volumes, or build cache.",
    pattern: {
      pattern: "docker system prune",
      description: "Docker system cleanup",
    },
  },
  {
    label: "git push --force",
    description:
      "Prompts before force-pushing Git history. Uses regex so the flag is caught regardless of its position in the command (e.g. `git push origin main --force` or `-f` at the end).",
    pattern: {
      pattern: "git push .*(-f\\b|--force(?!-with-lease)|--force-with-lease)",
      regex: true,
      description:
        "Git force push (any variant: --force, --force-with-lease, -f)",
    },
  },
  {
    label: "npm publish",
    description: "Prompts before publishing npm packages.",
    pattern: { pattern: "npm publish", description: "NPM package publishing" },
  },
  {
    label: "yarn publish",
    description: "Prompts before publishing Yarn packages.",
    pattern: {
      pattern: "yarn publish",
      description: "Yarn package publishing",
    },
  },
  {
    label: "pnpm publish",
    description: "Prompts before publishing pnpm packages.",
    pattern: {
      pattern: "pnpm publish",
      description: "PNPM package publishing",
    },
  },
  {
    label: "drop database",
    description: "Prompts before SQL statements that drop an entire database.",
    pattern: { pattern: "DROP DATABASE", description: "SQL database drop" },
  },
  {
    label: "drop table",
    description: "Prompts before SQL statements that drop tables.",
    pattern: { pattern: "DROP TABLE", description: "SQL table drop" },
  },
  {
    label: "dbt run",
    description:
      "Prompts before running dbt models that may transform warehouse data.",
    pattern: {
      pattern: "dbt run",
      description: "dbt model execution",
    },
  },
  {
    label: "dbt seed",
    description: "Prompts before loading dbt seed data into a warehouse.",
    pattern: {
      pattern: "dbt seed",
      description: "dbt seed data loading",
    },
  },
  {
    label: "aws s3 rm",
    description: "Prompts before deleting AWS S3 objects.",
    pattern: {
      pattern: "aws s3 rm",
      description: "AWS S3 object deletion",
    },
  },
  {
    label: "aws iam",
    description:
      "Prompts before AWS IAM commands that may change identities or permissions.",
    pattern: {
      pattern: "aws iam",
      description: "AWS IAM permission changes",
    },
  },
  {
    label: "aws ec2 terminate",
    description: "Prompts before terminating AWS EC2 instances.",
    pattern: {
      pattern: "aws ec2 terminate-instances",
      description: "AWS EC2 instance termination",
    },
  },
  {
    label: "kubectl apply",
    description: "Prompts before applying Kubernetes resource changes.",
    pattern: {
      pattern: "kubectl apply",
      description: "Kubernetes resource application",
    },
  },
  {
    label: "kubectl scale",
    description: "Prompts before scaling Kubernetes workloads.",
    pattern: {
      pattern: "kubectl scale",
      description: "Kubernetes scaling operation",
    },
  },
  {
    label: "docker rm",
    description: "Prompts before removing Docker containers.",
    pattern: {
      pattern: "docker rm",
      description: "Docker container removal",
    },
  },
  {
    label: "docker rmi",
    description: "Prompts before removing Docker images.",
    pattern: {
      pattern: "docker rmi",
      description: "Docker image removal",
    },
  },
  {
    label: "docker compose down",
    description: "Prompts before tearing down Docker Compose services.",
    pattern: {
      pattern: "docker compose down",
      description: "Docker Compose service teardown",
    },
  },
  {
    label: "terraform import",
    description:
      "Prompts before importing existing infrastructure into Terraform state.",
    pattern: {
      pattern: "terraform import",
      description: "Terraform resource import",
    },
  },
  {
    label: "gcloud compute delete",
    description: "Prompts before deleting Google Cloud compute instances.",
    pattern: {
      pattern: "gcloud compute instances delete",
      description: "GCP compute instance deletion",
    },
  },
  {
    label: "gcloud iam",
    description:
      "Prompts before Google Cloud IAM commands that may change permissions.",
    pattern: {
      pattern: "gcloud iam",
      description: "GCP IAM permission changes",
    },
  },
  {
    label: "gcloud sql delete",
    description: "Prompts before deleting Google Cloud SQL instances.",
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
