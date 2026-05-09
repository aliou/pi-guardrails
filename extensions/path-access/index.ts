import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import {
  normalizeForDisplay,
  type PathAccessState,
} from "../../src/core/paths";
import { configLoader } from "../../src/shared/config";
import {
  emitBlocked,
  GUARDRAILS_EXTENSIONS_REGISTER_EVENT,
  GUARDRAILS_EXTENSIONS_REQUEST_EVENT,
} from "../../src/shared/events";
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

  pi.events.on(GUARDRAILS_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(GUARDRAILS_EXTENSIONS_REGISTER_EVENT, {
      feature: "pathAccess",
    });
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
    const pendingGrants: PendingPathGrant[] = [];

    for (const absolutePath of targets) {
      const state: PathAccessState = {
        cwd: ctx.cwd,
        mode: config.pathAccess.mode,
        allowedPaths: [
          ...resolveAllowedPaths(config.pathAccess.allowedPaths, ctx.cwd),
          ...pendingAllowedPaths(pendingGrants),
        ],
        hasUI: ctx.hasUI,
      };
      const safety = await checkAction(
        { kind: "file", path: absolutePath, origin: event.toolName },
        [createPathAccessRule(state)],
      );
      if (safety.kind === "safe") continue;

      if (config.pathAccess.mode === "block" || !ctx.hasUI) {
        emitBlocked(pi, {
          feature: "pathAccess",
          toolName: event.toolName,
          input,
          reason: safety.reason,
        });
        return { block: true, reason: safety.reason };
      }

      const parentDir = dirname(absolutePath);
      const showFileOptions =
        event.toolName !== "ls" && event.toolName !== "find";
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
        pendingGrants.push(
          createPendingGrant(
            absolutePath,
            false,
            result === "allow-file-session" ? "memory" : "local",
          ),
        );
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
        pendingGrants.push(
          createPendingGrant(
            dirPath,
            true,
            result === "allow-dir-session" ? "memory" : "local",
          ),
        );
        continue;
      }

      const reason = "User denied access outside working directory";
      emitBlocked(pi, {
        feature: "pathAccess",
        toolName: event.toolName,
        input,
        reason,
        userDenied: true,
      });
      return { block: true, reason };
    }

    // TODO: Does the persistance here work? on block we're returning early and not getting to here.
    for (const grant of pendingGrants) {
      await persistGrant(grant);
    }
  });
}
