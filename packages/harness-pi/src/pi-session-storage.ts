import { HarnessError, type HarnessV1JSONValue } from '@ai-sdk/harness';
import {
  CURRENT_SESSION_VERSION,
  migrateSessionEntries,
  type SessionEntry,
  type SessionHeader,
} from '@earendil-works/pi-coding-agent';
import { z } from 'zod/v4';
import { sessionEntrySchema } from './pi-lifecycle-state';

interface PiSessionStorageEntry {
  /**
   * Id of the Pi session entry.
   */
  entryId: string;
  /**
   * Id of the entry this entry continues from. Absent on the first entry of a
   * session.
   */
  parentEntryId?: string;
  /**
   * Pi session version the entry was written under. The harness migrates
   * entries written under an older version when it reads them.
   */
  version: number;
  data: HarnessV1JSONValue;
}

/**
 * Caller-provided append-only log for harness sessions, such as an object
 * store, a database table or a stream. With a session storage, the harness
 * appends each new Pi session entry to the log, and the lifecycle state holds
 * only the id of the entry the session ends at. Entries are never changed or
 * deleted. Pi sessions are trees, so a regenerated turn, a retried step or a
 * second turn resumed from the same state appends a new branch, and each
 * lifecycle state selects its own branch. The storage moves JSON values; the
 * harness decides what an entry holds and checks it when it is read.
 */
export interface PiSessionStorage {
  /**
   * Appends one entry to the log of a session. An entry whose `entryId` the
   * log already holds is a retry of an earlier append and can be ignored.
   */
  append(
    options: PiSessionStorageEntry & {
      sessionId: string;
      abortSignal?: AbortSignal;
    },
  ): PromiseLike<void>;

  /**
   * Appends several entries to the log of a session, in order, as `append`
   * would one at a time. Without it, the harness calls `append` once per
   * entry.
   */
  appendMany?(options: {
    sessionId: string;
    entries: ReadonlyArray<PiSessionStorageEntry>;
    abortSignal?: AbortSignal;
  }): PromiseLike<void>;

  /**
   * Reads the entries of the log of a session that lead to `leafId`: the
   * entry whose `entryId` is `leafId`, its parent entry, and so on back to the
   * first entry, in the order they were appended, each with the `version` and
   * `data` it was appended with. Returning every entry of the log, including
   * other branches, is also valid.
   */
  read(options: {
    sessionId: string;
    leafId: string;
    abortSignal?: AbortSignal;
  }): PromiseLike<
    ReadonlyArray<Pick<PiSessionStorageEntry, 'version' | 'data'>>
  >;
}

const storedEntrySchema = z.looseObject({
  version: z.number(),
  data: sessionEntrySchema,
});

export async function appendSessionEntries({
  storage,
  sessionId,
  version,
  entries,
}: {
  storage: PiSessionStorage;
  sessionId: string;
  version: number;
  entries: readonly SessionEntry[];
}): Promise<void> {
  const stored = entries.map(entry => ({
    entryId: entry.id,
    parentEntryId: entry.parentId ?? undefined,
    version,
    data: entry as unknown as HarnessV1JSONValue,
  }));
  if (storage.appendMany != null) {
    await storage.appendMany({ sessionId, entries: stored });
    return;
  }
  for (const entry of stored) {
    await storage.append({ sessionId, ...entry });
  }
}

export async function readSessionEntries({
  storage,
  sessionId,
  leafId,
  abortSignal,
}: {
  storage: PiSessionStorage;
  sessionId: string;
  leafId: string;
  abortSignal?: AbortSignal;
}): Promise<SessionEntry[]> {
  const values = await storage.read({ sessionId, leafId, abortSignal });
  return values.map((value, index) => {
    const result = storedEntrySchema.safeParse(structuredClone(value));
    if (!result.success) {
      throw new HarnessError({
        message: `Entry ${index} of the Pi session "${sessionId}" is not a Pi session entry.`,
        cause: result.error,
      });
    }
    const { version, data: entry } = result.data;
    if (version < CURRENT_SESSION_VERSION) {
      migrateEntryFromVersion(version, entry);
    }
    return entry;
  });
}

function migrateEntryFromVersion(version: number, entry: SessionEntry): void {
  const header: SessionHeader = {
    type: 'session',
    version,
    id: '',
    timestamp: '',
    cwd: '',
  };
  migrateSessionEntries([header, entry]);
}
