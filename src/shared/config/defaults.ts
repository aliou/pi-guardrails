import { CURRENT_VERSION } from "./migration";
import type { ResolvedConfig } from "./types";

export const DEFAULT_CONFIG: ResolvedConfig = {
  version: CURRENT_VERSION,
  enabled: true,
  applyBuiltinDefaults: true,
  features: {
    policies: true,
    permissionGate: true,
    pathAccess: false,
  },
  pathAccess: {
    mode: "ask",
    allowedPaths: [{ kind: "file", path: "/dev/null" }],
  },
  policies: {
    rules: [
      {
        id: "secret-files",
        description: "Files containing secrets",
        patterns: [
          { pattern: ".env" },
          { pattern: ".env.local" },
          { pattern: ".env.production" },
          { pattern: ".env.prod" },
          { pattern: ".dev.vars" },
        ],
        allowedPatterns: [
          { pattern: "*.example.env" },
          { pattern: "*.sample.env" },
          { pattern: "*.test.env" },
          { pattern: ".env.example" },
          { pattern: ".env.sample" },
          { pattern: ".env.test" },
        ],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage:
          "Accessing {file} is not allowed. This file contains secrets. " +
          "Explain to the user why you want to access this file, and if changes are needed ask the user to make them.",
      },
      {
        id: "home-ssh",
        description: "SSH directory and keys",
        enabled: false,
        patterns: [
          { pattern: "~/.ssh/**" },
          { pattern: "~/.ssh/*_rsa" },
          { pattern: "~/.ssh/*_ed25519" },
          { pattern: "~/.ssh/*.pem" },
        ],
        allowedPatterns: [{ pattern: "~/.ssh/*.pub" }],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage:
          "Accessing {file} is not allowed. This file is part of your SSH configuration and may contain private keys or sensitive host information.",
      },
      {
        id: "home-config",
        description: "Sensitive user configuration directories",
        enabled: false,
        patterns: [
          { pattern: "~/.config/gh/**" },
          { pattern: "~/.config/gcloud/**" },
          { pattern: "~/.config/op/**" },
          { pattern: "~/.config/sops/**" },
        ],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage:
          "Accessing {file} is not allowed. This file is in a sensitive user configuration directory and may contain credentials or tokens.",
      },
      {
        id: "home-gpg",
        description: "GPG keys and configuration",
        enabled: false,
        patterns: [
          { pattern: "~/.gnupg/**" },
          { pattern: "~/*.gpg" },
          { pattern: "~/.gpg-agent.conf" },
        ],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage:
          "Accessing {file} is not allowed. This file is part of your GPG configuration and may contain private keys or trust settings.",
      },
    ],
  },
  permissionGate: {
    patterns: [
      { pattern: "rm -rf", description: "recursive force delete" },
      { pattern: "sudo", description: "superuser command" },
      { pattern: "dd of=", description: "disk write operation" },
      { pattern: "mkfs.", description: "filesystem format" },
      {
        pattern: "chmod -R 777",
        description: "insecure recursive permissions",
      },
      { pattern: "chown -R", description: "recursive ownership change" },
      { pattern: "doas", description: "privileged command execution" },
      { pattern: "pkexec", description: "privileged command execution" },
      { pattern: "shred", description: "secure file overwrite" },
      { pattern: "wipefs", description: "filesystem signature wipe" },
      { pattern: "blkdiscard", description: "block device discard" },
      { pattern: "fdisk", description: "disk partitioning" },
      { pattern: "parted", description: "disk partitioning" },
      {
        pattern: "docker run --privileged",
        description: "container with privileged mode",
      },
    ],
    useBuiltinMatchers: true,
    requireConfirmation: true,
    allowedPatterns: [],
    autoDenyPatterns: [],
  },
};
