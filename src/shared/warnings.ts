/**
 * Module-level warnings queue for messages that arise before any session
 * context is available (config loading, migration, pattern compilation).
 */
const pendingWarnings: string[] = [];

export function addPendingWarning(message: string): void {
  pendingWarnings.push(message);
}

export function getPendingWarnings(): readonly string[] {
  return pendingWarnings;
}

export function drainPendingWarnings(): string[] {
  return pendingWarnings.splice(0);
}
