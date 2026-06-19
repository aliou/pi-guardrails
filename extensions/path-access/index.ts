import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import {
  type AllowedPath,
  normalizeForDisplay,
  type PathAccessState,
} from "../../src/core/paths";
import { configLoader } from "../../src/shared/config";
import {
  createFeatureRegisterPayload,
  emitActionBlocked,
  emitActionPrompted,
  GUARDRAILS_FEATURE_REGISTER_EVENT,
  GUARDRAILS_FEATURE_REQUEST_EVENT,
} from "../../src/shared/events";
import { piDocumentationPaths } from "./dynamic-resources";
import {
  createPendingGrant,
  isGrantTooBroad,
  type PendingPathGrant,
  pendingAllowedPaths,
  persistGrant,
  resolveAllowedPaths,
} from "./grants";
import { createPathAccessPromptComponent, type PromptResult } from "./prompt";
import { createPathAccessRule } from "./rules";
import { targetsForTool } from "./targets";

export default async function pathAccess(pi: ExtensionAPI) {
  await configLoader.load();

  // Pi docs paths depend only on `PI_PACKAGE_DIR` / the package root and are
  // fixed for the process lifetime, so resolve once at setup.
  const piDocsPaths = piDocumentationPaths();

  let currentSkillAllowedPaths: AllowedPath[] = [];

  pi.on("before_agent_start", (event) => {
    const skills = event.systemPromptOptions.skills;

    if (!skills || skills.length === 0) return;

    currentSkillAllowedPaths = skills.flatMap((skill) => [
      { kind: "file", path: skill.filePath },
      { kind: "directory", path: skill.baseDir },
    ]);
  });

  pi.events.on(GUARDRAILS_FEATURE_REQUEST_EVENT, () => {
    pi.events.emit(
      GUARDRAILS_FEATURE_REGISTER_EVENT,
      createFeatureRegisterPayload("pathAccess"),
    );
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (
      !config.enabled ||
      !config.features.pathAccess ||
      config.pathAccess.mode === "allow"
    ) {
      return;
    }

    const input = event.input as Record<string, unknown>;
    const targets = [
      ...new Set(await targetsForTool(event.toolName, input, ctx.cwd)),
    ];
    const acceptedGrants: PendingPathGrant[] = [];

    for (const absolutePath of targets) {
      const action = {
        kind: "file" as const,
        path: absolutePath,
        origin: event.toolName,
      };
      const state: PathAccessState = {
        cwd: ctx.cwd,
        mode: config.pathAccess.mode,
        allowedPaths: [
          ...resolveAllowedPaths(config.pathAccess.allowedPaths, ctx.cwd),
          ...piDocsPaths,
          ...currentSkillAllowedPaths,
          ...pendingAllowedPaths(acceptedGrants),
        ],
        hasUI: ctx.hasUI,
      };
      const safety = await checkAction(action, [createPathAccessRule(state)]);
      if (safety.kind === "safe") continue;

      if (config.pathAccess.mode === "block" || !ctx.hasUI) {
        emitActionBlocked(pi, {
          feature: "pathAccess",
          action: safety.action,
          reason: safety.reason,
          block: {
            source: ctx.hasUI ? "policy" : "nonInteractive",
            metadata: safety.metadata,
          },
          context: { toolName: event.toolName, input },
        });
        return { block: true, reason: safety.reason };
      }

      const parentDir = dirname(absolutePath);
      const showFileOptions =
        event.toolName !== "ls" && event.toolName !== "find";
      emitActionPrompted(pi, {
        feature: "pathAccess",
        action: safety.action,
        reason: safety.reason,
        prompt: {
          kind: "confirmation",
          metadata: safety.metadata,
        },
        context: { toolName: event.toolName, input },
      });

      const result = await ctx.ui.custom<PromptResult>(
        createPathAccessPromptComponent(
          event.toolName,
          safety.metadata.displayPath,
          normalizeForDisplay(parentDir, ctx.cwd),
          ctx.cwd,
          showFileOptions,
        ),
      );

      if (result === "allow-file-once" || result === "allow-dir-once") {
        continue;
      }

      if (result === "allow-file-session" || result === "allow-file-always") {
        const grant = createPendingGrant(
          absolutePath,
          false,
          result === "allow-file-session" ? "memory" : "local",
        );
        acceptedGrants.push(grant);
        await persistGrant(grant);
        continue;
      }

      if (result === "allow-dir-session" || result === "allow-dir-always") {
        const dirPath = showFileOptions ? parentDir : absolutePath;
        if (isGrantTooBroad(dirPath)) {
          ctx.ui.notify(
            `Cannot grant access to ${normalizeForDisplay(dirPath, ctx.cwd)}/ — too broad. Treating as allow once.`,
            "warning",
          );
          continue;
        }
        const grant = createPendingGrant(
          dirPath,
          true,
          result === "allow-dir-session" ? "memory" : "local",
        );
        acceptedGrants.push(grant);
        await persistGrant(grant);
        continue;
      }

      const reason = "User denied access outside working directory";
      emitActionBlocked(pi, {
        feature: "pathAccess",
        action: safety.action,
        reason,
        block: { source: "user", metadata: safety.metadata },
        context: { toolName: event.toolName, input },
      });
      return { block: true, reason };
    }
  });
}
