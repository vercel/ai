import type { OpenCodeSyncEvent } from '../opencode-bridge-protocol';

/**
 * Sync helpers around OpenCode's `/sync` API: `POST /sync/history` exports the
 * event log that makes up a session, `POST /sync/replay` reconstructs it in a
 * fresh server. The wire shapes differ slightly (history returns
 * `aggregate_id`, replay takes `aggregateID`), and the SDK response wrappers
 * vary across versions, so the mapping/unwrapping lives here.
 */

/** Event shape accepted by `POST /sync/replay`. */
export type OpenCodeReplayEvent = {
  id: string;
  aggregateID: string;
  seq: number;
  type: string;
  data: Record<string, unknown>;
};

/** Unwrap a `/sync/history` response into its event array. */
export function normalizeSyncHistory(data: unknown): OpenCodeSyncEvent[] {
  if (Array.isArray(data)) return data as OpenCodeSyncEvent[];
  if (
    data != null &&
    typeof data === 'object' &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return (data as { data: OpenCodeSyncEvent[] }).data;
  }
  return [];
}

/** Map exported history events to the `/sync/replay` request shape. */
export function toReplayEvents(
  events: ReadonlyArray<OpenCodeSyncEvent>,
): OpenCodeReplayEvent[] {
  return events.map(event => ({
    id: event.id,
    aggregateID: event.aggregate_id,
    seq: event.seq,
    type: event.type,
    data: event.data ?? {},
  }));
}

/** Read the session id from a `/sync/replay` response (`{ sessionID }`). */
export function readReplaySessionId(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const record = data as { sessionID?: unknown; id?: unknown };
  if (typeof record.sessionID === 'string' && record.sessionID.length > 0) {
    return record.sessionID;
  }
  if (typeof record.id === 'string' && record.id.length > 0) return record.id;
  return undefined;
}
