import {
  FuzzySelector,
  getNestedValue,
  registerSettingsCommand,
  SettingsDetailEditor,
  type SettingsDetailField,
  type SettingsSection,
  type SettingsTheme,
  setNestedValue,
  Wizard,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Input,
  Key,
  matchesKey,
  type SettingItem,
  type SettingsListTheme,
} from "@mariozechner/pi-tui";
import { PatternEditor } from "../components/pattern-editor";
import type {
  DangerousPattern,
  GuardrailsConfig,
  PatternConfig,
  PolicyRule,
  ResolvedConfig,
} from "../config";
import { configLoader } from "../config";

type FeatureKey = keyof ResolvedConfig["features"];

const FEATURE_UI: Record<FeatureKey, { label: string; description: string }> = {
  policies: {
    label: "Policies",
    description: "Block or limit file access using named policy rules",
  },
  permissionGate: {
    label: "Permission gate",
    description:
      "Prompt for confirmation on dangerous commands (rm -rf, sudo, etc.)",
  },
};

const POLICY_EXAMPLES: Array<{
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

const COMMAND_EXAMPLES: Array<{
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

function toKebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function appendPolicyRule(
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

function appendDangerousPattern(
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

interface NewPolicyDraft {
  name: string;
  id: string;
  protection: PolicyRule["protection"];
  patterns: PatternConfig[];
}

class PolicyNameStep implements Component {
  private readonly input = new Input();

  constructor(
    private readonly theme: SettingsListTheme,
    private readonly state: NewPolicyDraft,
    private readonly onComplete: () => void,
  ) {
    this.input.setValue(state.name);
    this.input.onSubmit = () => {
      const name = this.input.getValue().trim();
      if (!name) return;
      this.state.name = name;
      if (!this.state.id) {
        this.state.id = toKebabCase(name) || "policy";
      }
      this.onComplete();
    };
  }

  invalidate() {}

  render(width: number): string[] {
    return [
      this.theme.hint("  Step 1: Policy name"),
      "",
      ...this.input.render(Math.max(1, width - 2)).map((line) => ` ${line}`),
      "",
      this.theme.hint("  Example: Secret files"),
      this.theme.hint("  Enter to continue"),
    ];
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }
}

class PolicyProtectionStep implements Component {
  private readonly selector: FuzzySelector;

  constructor(
    theme: SettingsListTheme,
    state: NewPolicyDraft,
    onComplete: () => void,
  ) {
    this.selector = new FuzzySelector({
      label: "Protection",
      items: ["noAccess", "readOnly", "none"],
      currentValue: state.protection,
      theme,
      onSelect: (value) => {
        if (value === "noAccess" || value === "readOnly" || value === "none") {
          state.protection = value;
          onComplete();
        }
      },
      onDone: () => {
        // Esc is handled by Wizard.
      },
    });
  }

  invalidate(): void {
    this.selector.invalidate?.();
  }

  render(width: number): string[] {
    return this.selector.render(width);
  }

  handleInput(data: string): void {
    this.selector.handleInput(data);
  }
}

class PolicyPatternsStep implements Component {
  private readonly editor: PatternEditor;

  constructor(
    theme: SettingsListTheme,
    state: NewPolicyDraft,
    onComplete: () => void,
  ) {
    this.editor = new PatternEditor({
      label: "Policy patterns",
      context: "file",
      theme,
      items: state.patterns.map((p) => ({
        pattern: p.pattern,
        description: p.pattern,
        regex: p.regex,
      })),
      onSave: (items) => {
        state.patterns = items
          .map((item) => {
            const pattern = item.pattern.trim();
            if (!pattern) return null;
            return {
              pattern,
              ...(item.regex ? { regex: true } : {}),
            };
          })
          .filter((item): item is PatternConfig => item !== null);
      },
      onDone: () => {
        if (state.patterns.length > 0) {
          onComplete();
        }
      },
    });
  }

  invalidate(): void {
    this.editor.invalidate?.();
  }

  render(width: number): string[] {
    return this.editor.render(width);
  }

  handleInput(data: string): void {
    this.editor.handleInput(data);
  }
}

class PolicyReviewStep implements Component {
  constructor(
    private readonly theme: SettingsListTheme,
    private readonly state: NewPolicyDraft,
  ) {}

  invalidate() {}

  render(_width: number): string[] {
    const patternPreview =
      this.state.patterns.length > 0
        ? this.state.patterns
            .slice(0, 3)
            .map((p) => `${p.pattern}${p.regex ? " [regex]" : ""}`)
            .join(", ")
        : "(none)";

    return [
      this.theme.hint("  Review"),
      "",
      this.theme.hint(`  Name: ${this.state.name || "(empty)"}`),
      this.theme.hint(`  ID: ${this.state.id || "(auto)"}`),
      this.theme.hint(`  Protection: ${this.state.protection}`),
      this.theme.hint(`  Patterns: ${this.state.patterns.length}`),
      this.theme.hint(`  ${patternPreview}`),
      "",
      this.theme.hint("  Ctrl+S: create + open editor · Esc: cancel"),
    ];
  }

  handleInput(_data: string): void {}
}

class AddRuleSubmenu implements Component {
  private readonly wizard: Wizard;
  private activeEditor: Component | null = null;

  constructor(
    theme: SettingsTheme,
    onCreate: (draft: NewPolicyDraft) => number | null,
    openEditor: (index: number, done: (value?: string) => void) => Component,
    onDone: (value?: string) => void,
  ) {
    const state: NewPolicyDraft = {
      name: "",
      id: "",
      protection: "readOnly",
      patterns: [],
    };

    this.wizard = new Wizard({
      title: "Add policy",
      theme,
      steps: [
        {
          label: "Name",
          build: (ctx) =>
            new PolicyNameStep(theme, state, () => {
              ctx.markComplete();
              ctx.goNext();
            }),
        },
        {
          label: "Protection",
          build: (ctx) =>
            new PolicyProtectionStep(theme, state, () => {
              ctx.markComplete();
              ctx.goNext();
            }),
        },
        {
          label: "Patterns",
          build: (ctx) =>
            new PolicyPatternsStep(theme, state, () => {
              if (state.patterns.length === 0) {
                ctx.markIncomplete();
                return;
              }
              ctx.markComplete();
              ctx.goNext();
            }),
        },
        {
          label: "Review",
          build: (ctx) => {
            ctx.markComplete();
            return new PolicyReviewStep(theme, state);
          },
        },
      ],
      onComplete: () => {
        if (!state.name.trim() || state.patterns.length === 0) return;
        const index = onCreate(state);
        if (index === null) return;
        this.activeEditor = openEditor(index, (value) => {
          this.activeEditor = null;
          onDone(value);
        });
      },
      onCancel: () => onDone(),
      hintSuffix: "complete steps · Ctrl+S create",
      minContentHeight: 12,
    });
  }

  invalidate(): void {
    this.activeEditor?.invalidate?.();
    this.wizard.invalidate?.();
  }

  render(width: number): string[] {
    if (this.activeEditor) {
      return this.activeEditor.render(width);
    }
    return this.wizard.render(width);
  }

  handleInput(data: string): void {
    if (this.activeEditor) {
      this.activeEditor.handleInput?.(data);
      return;
    }
    this.wizard.handleInput(data);
  }
}

class ScopePickerSubmenu implements Component {
  private selectedIndex = 0;

  constructor(
    private readonly theme: SettingsListTheme,
    private readonly scopes: Array<"global" | "local" | "memory">,
    private readonly onSelect: (scope: "global" | "local" | "memory") => void,
    private readonly onDone: (value?: string) => void,
  ) {}

  invalidate() {}

  render(_width: number): string[] {
    const lines: string[] = [
      this.theme.label(" Add example to scope", true),
      "",
      this.theme.hint("  Select target scope:"),
    ];

    for (let i = 0; i < this.scopes.length; i++) {
      const scope = this.scopes[i];
      if (!scope) continue;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.theme.cursor : "  ";
      lines.push(`${prefix}${this.theme.value(scope, isSelected)}`);
    }

    lines.push("");
    lines.push(this.theme.hint("  Enter: apply · Esc: back"));
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.scopes.length - 1
          : this.selectedIndex - 1;
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex =
        this.selectedIndex === this.scopes.length - 1
          ? 0
          : this.selectedIndex + 1;
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const scope = this.scopes[this.selectedIndex];
      if (!scope) return;
      this.onSelect(scope);
      this.onDone(`applied to ${scope}`);
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.onDone();
    }
  }
}

function createPolicyRuleEditor(options: {
  index: number;
  theme: SettingsListTheme;
  getRule: () => PolicyRule | undefined;
  updateRule: (updater: (rule: PolicyRule) => PolicyRule) => void;
  deleteRule: () => void;
  onDone: (value?: string) => void;
}): SettingsDetailEditor {
  const { index, theme, getRule, updateRule, deleteRule, onDone } = options;

  const fields: SettingsDetailField[] = [
    {
      id: "name",
      type: "text",
      label: "Name",
      description: "Display name shown in settings",
      getValue: () => getRule()?.name?.trim() || "",
      setValue: (value) => {
        const next = value.trim();
        updateRule((rule) => ({ ...rule, name: next || undefined }));
      },
      emptyValueText: "(uses id)",
    },
    {
      id: "id",
      type: "text",
      label: "ID",
      description: "Stable identifier used for overrides across scopes",
      getValue: () => getRule()?.id ?? "",
      setValue: (value) => {
        const next = value.trim();
        if (!next) return;
        updateRule((rule) => ({ ...rule, id: next }));
      },
    },
    {
      id: "description",
      type: "text",
      label: "Description",
      description: "Human-readable explanation",
      getValue: () => getRule()?.description?.trim() || "",
      setValue: (value) => {
        const next = value.trim();
        updateRule((rule) => ({ ...rule, description: next || undefined }));
      },
      emptyValueText: "(empty)",
    },
    {
      id: "protection",
      type: "enum",
      label: "Protection",
      description: "noAccess | readOnly | none",
      getValue: () => getRule()?.protection ?? "readOnly",
      setValue: (value) => {
        if (value !== "noAccess" && value !== "readOnly" && value !== "none") {
          return;
        }
        updateRule((rule) => ({ ...rule, protection: value }));
      },
      options: ["noAccess", "readOnly", "none"],
    },
    {
      id: "enabled",
      type: "boolean",
      label: "Enabled",
      description: "Turn this policy on/off",
      getValue: () => getRule()?.enabled !== false,
      setValue: (value) => {
        updateRule((rule) => ({ ...rule, enabled: value }));
      },
      trueLabel: "on",
      falseLabel: "off",
    },
    {
      id: "onlyIfExists",
      type: "boolean",
      label: "Only if exists",
      description: "Only block when file exists on disk",
      getValue: () => getRule()?.onlyIfExists !== false,
      setValue: (value) => {
        updateRule((rule) => ({ ...rule, onlyIfExists: value }));
      },
      trueLabel: "on",
      falseLabel: "off",
    },
    {
      id: "patterns",
      type: "submenu",
      label: "Patterns",
      description: "Files protected by this policy",
      getValue: () => `${getRule()?.patterns?.length ?? 0} items`,
      submenu: (done) => {
        const rule = getRule();
        const items = (rule?.patterns ?? []).map((p) => ({
          pattern: p.pattern,
          description: p.pattern,
          regex: p.regex,
        }));

        return new PatternEditor({
          label: "Policy patterns",
          items,
          theme,
          context: "file",
          onSave: (newItems) => {
            const patterns: PatternConfig[] = newItems
              .map((p) => {
                const pattern = p.pattern.trim();
                if (!pattern) return null;
                return { pattern, ...(p.regex ? { regex: true } : {}) };
              })
              .filter((item): item is PatternConfig => item !== null);

            updateRule((current) => ({ ...current, patterns }));
          },
          onDone: () => done(`${getRule()?.patterns?.length ?? 0} items`),
        });
      },
    },
    {
      id: "allowedPatterns",
      type: "submenu",
      label: "Allowed patterns",
      description: "Exceptions",
      getValue: () => `${getRule()?.allowedPatterns?.length ?? 0} items`,
      submenu: (done) => {
        const rule = getRule();
        const items = (rule?.allowedPatterns ?? []).map((p) => ({
          pattern: p.pattern,
          description: p.pattern,
          regex: p.regex,
        }));

        return new PatternEditor({
          label: "Policy allowed patterns",
          items,
          theme,
          context: "file",
          onSave: (newItems) => {
            const patterns: PatternConfig[] = newItems
              .map((p) => {
                const pattern = p.pattern.trim();
                if (!pattern) return null;
                return { pattern, ...(p.regex ? { regex: true } : {}) };
              })
              .filter((item): item is PatternConfig => item !== null);

            updateRule((current) => ({
              ...current,
              allowedPatterns: patterns.length > 0 ? patterns : undefined,
            }));
          },
          onDone: () =>
            done(`${getRule()?.allowedPatterns?.length ?? 0} items`),
        });
      },
    },
    {
      id: "blockMessage",
      type: "text",
      label: "Block message",
      description: "Custom block message ({file} supported)",
      getValue: () => getRule()?.blockMessage?.trim() || "",
      setValue: (value) => {
        const next = value.trim();
        updateRule((rule) => ({ ...rule, blockMessage: next || undefined }));
      },
      emptyValueText: "(default)",
    },
    {
      id: "delete",
      type: "action",
      label: "Delete rule",
      description: "Remove this rule",
      getValue: () => "danger",
      onConfirm: () => {
        deleteRule();
      },
      confirmMessage: "Delete this rule? This cannot be undone.",
    },
  ];

  return new SettingsDetailEditor({
    title: () => {
      const rule = getRule();
      const title = rule?.name?.trim() || rule?.id || `Policy ${index + 1}`;
      return `Policy: ${title}`;
    },
    fields,
    theme,
    onDone,
    getDoneSummary: () => {
      const rule = getRule();
      if (!rule) return "deleted";
      return `${rule.protection}, ${rule.enabled === false ? "disabled" : "enabled"}`;
    },
  });
}

export function registerGuardrailsSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<GuardrailsConfig, ResolvedConfig>(pi, {
    commandName: "guardrails:settings",
    title: "Guardrails Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: GuardrailsConfig | null,
      _resolved: ResolvedConfig,
      { setDraft, theme },
    ): SettingsSection[] => {
      const settingsTheme = theme;
      let scopedConfig = structuredClone(tabConfig ?? {}) as GuardrailsConfig;

      function commitDraft(next: GuardrailsConfig): void {
        scopedConfig = next;
        setDraft(structuredClone(next));
      }

      function count(id: string): string {
        const val =
          (getNestedValue(scopedConfig, id) as unknown[] | undefined) ?? [];
        return `${val.length} items`;
      }

      function applyDraft(id: string, value: unknown): void {
        const updated = structuredClone(scopedConfig);
        setNestedValue(updated, id, value);
        commitDraft(updated);
      }

      function getPolicyRules(): PolicyRule[] {
        return scopedConfig.policies?.rules?.map((r) => ({ ...r })) ?? [];
      }

      function setPolicyRules(rules: PolicyRule[]): void {
        const updated = structuredClone(scopedConfig);
        updated.policies = {
          ...(updated.policies ?? {}),
          rules,
        };
        commitDraft(updated);
      }

      function updateRule(
        index: number,
        updater: (rule: PolicyRule) => PolicyRule,
      ): void {
        const rules = getPolicyRules();
        const existing = rules[index];
        if (!existing) return;
        rules[index] = updater(existing);
        setPolicyRules(rules);
      }

      function deleteRule(index: number): void {
        const rules = getPolicyRules();
        if (!rules[index]) return;
        rules.splice(index, 1);
        setPolicyRules(rules);
      }

      function addRule(draft: NewPolicyDraft): number | null {
        const normalizedName = draft.name.trim();
        if (!normalizedName || draft.patterns.length === 0) return null;

        const rules = getPolicyRules();
        const baseId = toKebabCase(draft.id || normalizedName) || "policy";
        const existingIds = new Set(rules.map((rule) => rule.id));

        let id = baseId;
        let i = 2;
        while (existingIds.has(id)) {
          id = `${baseId}-${i}`;
          i++;
        }

        rules.push({
          id,
          name: normalizedName,
          description: "",
          patterns: draft.patterns,
          protection: draft.protection,
          onlyIfExists: true,
          enabled: true,
        });
        setPolicyRules(rules);
        return rules.length - 1;
      }

      function patternSubmenu(
        id: string,
        label: string,
        context?: "file" | "command",
      ) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const items =
            (getNestedValue(scopedConfig, id) as
              | DangerousPattern[]
              | undefined) ?? [];
          let latestCount = items.length;
          return new PatternEditor({
            label,
            items: [...items],
            theme: settingsTheme,
            context,
            onSave: (newItems) => {
              latestCount = newItems.length;
              applyDraft(id, newItems);
            },
            onDone: () => submenuDone(`${latestCount} items`),
          });
        };
      }

      function patternConfigSubmenu(
        id: string,
        label: string,
        context?: "file" | "command",
      ) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const currentItems =
            (getNestedValue(scopedConfig, id) as PatternConfig[] | undefined) ??
            [];
          const items = currentItems.map((p) => ({
            pattern: p.pattern,
            description: p.pattern,
            regex: p.regex,
          }));
          let latestCount = items.length;
          return new PatternEditor({
            label,
            items,
            theme: settingsTheme,
            context,
            onSave: (newItems) => {
              latestCount = newItems.length;
              const configs: PatternConfig[] = newItems
                .map((p) => {
                  const pattern = p.pattern.trim();
                  if (!pattern) return null;
                  const cfg: PatternConfig = { pattern };
                  if (p.regex) cfg.regex = true;
                  return cfg;
                })
                .filter((item): item is PatternConfig => item !== null);
              applyDraft(id, configs);
            },
            onDone: () => submenuDone(`${latestCount} items`),
          });
        };
      }

      function hasExplainModelOverride(): boolean {
        return scopedConfig.permissionGate?.explainModel !== undefined;
      }

      function getExplainModel(): string {
        return scopedConfig.permissionGate?.explainModel?.trim() ?? "";
      }

      function hasExplainTimeoutOverride(): boolean {
        return scopedConfig.permissionGate?.explainTimeout !== undefined;
      }

      function getExplainTimeout(): number | null {
        return scopedConfig.permissionGate?.explainTimeout ?? null;
      }

      const featureItems = (Object.keys(FEATURE_UI) as FeatureKey[])
        .filter((key) => key !== "policies")
        .map((key) => {
          const scopedValue = scopedConfig.features?.[key];
          return {
            id: `features.${key}`,
            label: FEATURE_UI[key].label,
            description: FEATURE_UI[key].description,
            currentValue:
              scopedValue === undefined
                ? "(inherited)"
                : scopedValue
                  ? "enabled"
                  : "disabled",
            values: ["enabled", "disabled"],
          };
        });

      const policyRules = getPolicyRules();

      const openPolicyEditor = (
        index: number,
        submenuDone: (v?: string) => void,
      ): Component =>
        createPolicyRuleEditor({
          index,
          theme: settingsTheme,
          getRule: () => getPolicyRules()[index],
          updateRule: (updater) => updateRule(index, updater),
          deleteRule: () => deleteRule(index),
          onDone: submenuDone,
        });

      const policyItems: SettingItem[] = [
        {
          id: "features.policies",
          label: "  Enabled",
          description: FEATURE_UI.policies.description,
          currentValue:
            scopedConfig.features?.policies === undefined
              ? "(inherited)"
              : scopedConfig.features.policies
                ? "enabled"
                : "disabled",
          values: ["enabled", "disabled"],
        },
        ...policyRules.map((rule, index) => {
          const label = rule.name?.trim() || rule.id || `Policy ${index + 1}`;
          return {
            id: `policies.rules.${index}`,
            label: `  ${label}`,
            description: rule.description?.trim() || "No description",
            currentValue: `${rule.protection}, ${rule.enabled === false ? "disabled" : "enabled"}`,
            submenu: (_val: string, submenuDone: (v?: string) => void) =>
              openPolicyEditor(index, submenuDone),
          };
        }),
      ];

      policyItems.push({
        id: "policies.addRule",
        label: "  + Add policy",
        description: "Open wizard to create policy",
        currentValue: "",
        submenu: (_val: string, submenuDone: (v?: string) => void) =>
          new AddRuleSubmenu(
            settingsTheme,
            addRule,
            (index, done) => openPolicyEditor(index, done),
            submenuDone,
          ),
      });

      return [
        { label: "Features", items: featureItems },
        {
          label: `Policies (${policyRules.length})`,
          items: policyItems,
        },
        {
          label: "Permission Gate",
          items: [
            {
              id: "permissionGate.requireConfirmation",
              label: "Require confirmation",
              description:
                "Show confirmation dialog for dangerous commands (if off, just warns)",
              currentValue:
                scopedConfig.permissionGate?.requireConfirmation === undefined
                  ? "(inherited)"
                  : scopedConfig.permissionGate.requireConfirmation
                    ? "on"
                    : "off",
              values: ["on", "off"],
            },
            {
              id: "permissionGate.patterns",
              label: "Dangerous patterns",
              description: "Command patterns that trigger the permission gate",
              currentValue: count("permissionGate.patterns"),
              submenu: patternSubmenu(
                "permissionGate.patterns",
                "Dangerous Patterns",
                "command",
              ),
            },
            {
              id: "permissionGate.allowedPatterns",
              label: "Allowed commands",
              description: "Patterns that bypass the permission gate entirely",
              currentValue: count("permissionGate.allowedPatterns"),
              submenu: patternConfigSubmenu(
                "permissionGate.allowedPatterns",
                "Allowed Commands",
                "command",
              ),
            },
            {
              id: "permissionGate.autoDenyPatterns",
              label: "Auto-deny patterns",
              description:
                "Patterns that block commands immediately without dialog",
              currentValue: count("permissionGate.autoDenyPatterns"),
              submenu: patternConfigSubmenu(
                "permissionGate.autoDenyPatterns",
                "Auto-Deny Patterns",
                "command",
              ),
            },
            {
              id: "permissionGate.explainCommands",
              label: "Explain commands",
              description:
                "Call an LLM to explain dangerous commands in the confirmation dialog",
              currentValue:
                scopedConfig.permissionGate?.explainCommands === undefined
                  ? "(inherited)"
                  : scopedConfig.permissionGate.explainCommands
                    ? "on"
                    : "off",
              values: ["on", "off"],
            },
            {
              id: "permissionGate.explainModel",
              label: "Explain model",
              description: "Model spec in provider/model-id format",
              currentValue: hasExplainModelOverride()
                ? getExplainModel() || "(not set)"
                : "(inherited)",
              submenu: (_val: string, submenuDone: (v?: string) => void) =>
                new SettingsDetailEditor({
                  title: "Explain Commands: Model",
                  theme: settingsTheme,
                  onDone: submenuDone,
                  getDoneSummary: () => getExplainModel() || "(not set)",
                  fields: [
                    {
                      id: "permissionGate.explainModel",
                      type: "text",
                      label: "Model",
                      description: "Format: provider/model-id",
                      getValue: getExplainModel,
                      setValue: (value) => {
                        const model = value.trim();
                        applyDraft(
                          "permissionGate.explainModel",
                          model || undefined,
                        );
                      },
                      emptyValueText: "(not set)",
                    },
                  ],
                }),
            },
            {
              id: "permissionGate.explainTimeout",
              label: "Explain timeout",
              description: "Timeout for LLM explanation in milliseconds",
              currentValue: hasExplainTimeoutOverride()
                ? `${getExplainTimeout()}ms`
                : "(inherited)",
              submenu: (_val: string, submenuDone: (v?: string) => void) =>
                new SettingsDetailEditor({
                  title: "Explain Commands: Timeout",
                  theme: settingsTheme,
                  onDone: submenuDone,
                  getDoneSummary: () => {
                    const timeout = getExplainTimeout();
                    return timeout === null ? "(not set)" : `${timeout}ms`;
                  },
                  fields: [
                    {
                      id: "permissionGate.explainTimeout",
                      type: "text",
                      label: "Timeout (ms)",
                      description: "Abort explanation call after this many ms",
                      getValue: () => {
                        const timeout = getExplainTimeout();
                        return timeout === null ? "" : String(timeout);
                      },
                      setValue: (value) => {
                        const parsed = Number.parseInt(value.trim(), 10);
                        if (Number.isNaN(parsed) || parsed < 1) return;
                        applyDraft("permissionGate.explainTimeout", parsed);
                      },
                    },
                  ],
                }),
            },
          ],
        },
      ];
    },
    extraTabs: [
      {
        id: "examples",
        label: "Examples",
        buildSections: ({
          enabledScopes,
          getDraftForScope,
          getRawForScope,
          setDraftForScope,
          theme,
        }): SettingsSection[] => {
          const policyItems: SettingItem[] = POLICY_EXAMPLES.map((example) => ({
            id: `examples.${example.rule.id}`,
            label: `  ${example.label}`,
            description: example.description,
            currentValue: "apply",
            submenu: (_val: string, submenuDone: (v?: string) => void) =>
              new ScopePickerSubmenu(
                theme,
                enabledScopes,
                (targetScope) => {
                  const baseConfig =
                    getDraftForScope(targetScope) ??
                    getRawForScope(targetScope) ??
                    null;
                  const updated = appendPolicyRule(baseConfig, example.rule);
                  setDraftForScope(targetScope, updated);
                },
                submenuDone,
              ),
          }));

          const commandItems: SettingItem[] = COMMAND_EXAMPLES.map(
            (example) => ({
              id: `examples.cmd.${example.pattern.pattern}`,
              label: `  ${example.label}`,
              description: example.description,
              currentValue: "add",
              submenu: (_val: string, submenuDone: (v?: string) => void) =>
                new ScopePickerSubmenu(
                  theme,
                  enabledScopes,
                  (targetScope) => {
                    const baseConfig =
                      getDraftForScope(targetScope) ??
                      getRawForScope(targetScope) ??
                      null;
                    const updated = appendDangerousPattern(
                      baseConfig,
                      example.pattern,
                    );
                    setDraftForScope(targetScope, updated);
                  },
                  submenuDone,
                ),
            }),
          );

          return [
            {
              label: "File policy presets",
              items: policyItems,
            },
            {
              label: "Dangerous command presets",
              items: commandItems,
            },
          ];
        },
      },
    ],
  });
}
