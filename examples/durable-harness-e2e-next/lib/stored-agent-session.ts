import {
  isAgentConfigurationName,
  type AgentConfigurationName,
} from '@/lib/harness';

/**
 * What the browser keeps to continue an agent session: its session ID, the
 * ID of its sandbox, and the ID of the World run that holds its log and
 * stream. Sent along with every chat request after the first.
 */
export type StoredAgentSession = {
  sessionId: string;
  sandboxId: string;
  runId: string;
  /**
   * Selects the agent that owns the durable run for every request, including
   * stream reconnection. Missing values select the `basic` configuration.
   */
  configuration?: AgentConfigurationName;
};

function storageKeyFor({ chatId }: { chatId: string }): string {
  return `durable-harness-agent-session:${chatId}`;
}

/**
 * Returns whether a value has the shape of a `StoredAgentSession`.
 */
export function isStoredAgentSession(
  value: unknown,
): value is StoredAgentSession {
  if (typeof value !== 'object' || value == null) return false;
  const { sessionId, sandboxId, runId, configuration } = value as Record<
    string,
    unknown
  >;
  return (
    typeof sessionId === 'string' &&
    typeof sandboxId === 'string' &&
    typeof runId === 'string' &&
    (configuration === undefined || isAgentConfigurationName(configuration))
  );
}

/**
 * Reads the agent session of a chat from session storage.
 */
export function readStoredAgentSession({
  chatId,
}: {
  chatId: string;
}): StoredAgentSession | undefined {
  const text = window.sessionStorage.getItem(storageKeyFor({ chatId }));
  if (text == null) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isStoredAgentSession(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the agent session of a chat to session storage.
 */
export function writeStoredAgentSession({
  chatId,
  session,
}: {
  chatId: string;
  session: StoredAgentSession;
}): void {
  window.sessionStorage.setItem(
    storageKeyFor({ chatId }),
    JSON.stringify(session),
  );
}

/**
 * Removes the agent session of a chat from session storage.
 */
export function clearStoredAgentSession({ chatId }: { chatId: string }): void {
  window.sessionStorage.removeItem(storageKeyFor({ chatId }));
}
