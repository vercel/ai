import type { HarnessName } from '@/lib/harness';
import {
  isStoredAgentSession,
  type StoredAgentSession,
} from '@/lib/stored-agent-session';

/**
 * Creates the agent session of a chat on the given harness, with a new
 * sandbox, and returns what the browser stores to continue it.
 */
export async function createAgentSession({
  harness,
  chatId,
}: {
  harness: HarnessName;
  chatId: string;
}): Promise<StoredAgentSession> {
  const response = await fetch(`/api/${harness}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create a session: ${response.status} ${await response.text()}`,
    );
  }
  const session: unknown = await response.json();
  if (!isStoredAgentSession(session)) {
    throw new Error('Failed to create a session: invalid response.');
  }
  return session;
}
