import { configLoader } from "../../src/shared/config";
import { compileCommandPatterns } from "../../src/shared/matching";

export function isCommandAllowed(command: string): boolean {
  const config = configLoader.getConfig();
  return compileCommandPatterns(config.permissionGate.allowedPatterns).some(
    (pattern) => pattern.test(command),
  );
}

export async function saveCommandSessionGrant(command: string): Promise<void> {
  const resolved = configLoader.getConfig();
  await configLoader.save("memory", {
    permissionGate: {
      allowedPatterns: [
        ...resolved.permissionGate.allowedPatterns,
        { pattern: exactCommandPattern(command), regex: true },
      ],
    },
  });
}

function exactCommandPattern(command: string): string {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `^(?:${escaped})(?![\\s\\S])`;
}
