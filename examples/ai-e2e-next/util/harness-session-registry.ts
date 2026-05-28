import type { HarnessAgentSession } from '@ai-sdk/harness/agent';

/*
 * In-memory registry of live harness sessions, keyed by chat id.
 *
 * The example keeps each chat's session — and therefore its sandbox — warm
 * across turns. The first message of a chat creates a session and registers it
 * here; every later message reuses the same live session, so anything the agent
 * did in the sandbox (a cloned repo, edited files, conversation state) survives
 * between turns with no detach, snapshot, or resume round-trip.
 *
 * Stored on `globalThis` so the map survives the module re-evaluation Next.js
 * performs on hot reload in development. It is process-local: it does not
 * survive a server restart, and it assumes consecutive turns of a chat reach
 * the same process — true for a single dev/server process. A multi-instance
 * deployment would instead need cross-process session handoff (detach + persist
 * the resume state, resume on the next process).
 */
const REGISTRY_KEY = Symbol.for('ai-sdk.example.harness-session-registry');

type Registry = Map<string, HarnessAgentSession>;

function registry(): Registry {
  const globalForRegistry = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: Registry;
  };
  globalForRegistry[REGISTRY_KEY] ??= new Map();
  return globalForRegistry[REGISTRY_KEY];
}

export function getHarnessSession(
  chatId: string,
): HarnessAgentSession | undefined {
  return registry().get(chatId);
}

export function setHarnessSession(
  chatId: string,
  session: HarnessAgentSession,
): void {
  registry().set(chatId, session);
}

export function deleteHarnessSession(chatId: string): void {
  registry().delete(chatId);
}
