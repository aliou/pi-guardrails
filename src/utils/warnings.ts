/**
 * Module-level warnings queue for messages that arise before any session
 * context is available (config loading, migration, pattern compilation).
 *
 * Drained and reported via ctx.ui.notify in the session_start handler.
 */
export const pendingWarnings: string[] = [];
