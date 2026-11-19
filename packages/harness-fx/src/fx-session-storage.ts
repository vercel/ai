import { randomUUID } from 'node:crypto';
import { HarnessError } from '@ai-sdk/harness';
import type { JSONObject } from '@ai-sdk/provider';
import { z } from 'zod/v4';
import {
  fxProviderSchema,
  fxSessionStateSchema,
  fxTurnStateSchema,
  type FxSessionState,
} from './fx-resume-state';

interface FxSessionStorageEntry {
  /**
   * Id of the entry.
   */
  entryId: string;
  /**
   * Id of the entry this entry continues from. Absent on the first entry of a
   * session.
   */
  parentEntryId?: string;
  /**
   * Opaque JSON written by the harness. The storage keeps it as-is.
   */
  data: JSONObject;
}

/**
 * Caller-provided append-only log for fx sessions, such as an object store, a
 * database table or a stream. When a session suspends a turn, detaches or
 * stops, the harness appends one entry holding what changed since the previous
 * entry, and the lifecycle state holds only the id of that entry. Entries are
 * never changed or deleted. A second turn resumed from the same state appends
 * a new branch, and each lifecycle state selects its own branch.
 */
export interface FxSessionStorage {
  /**
   * Appends one entry to the log of a session. An entry whose `entryId` the
   * log already holds is a retry of an earlier append and can be ignored.
   */
  append(options: {
    sessionId: string;
    entry: FxSessionStorageEntry;
  }): PromiseLike<void>;

  /**
   * Reads the entries of the log of a session that lead to `leafId`: the entry
   * whose `entryId` is `leafId`, its parent entry, and so on back to the first
   * entry. The result may also contain other entries of the session, in any
   * order.
   */
  read(options: {
    sessionId: string;
    leafId: string;
    abortSignal?: AbortSignal;
  }): PromiseLike<ReadonlyArray<FxSessionStorageEntry>>;
}

/*
 * Each entry holds the fields of the session state that changed since its
 * parent entry. A `turn` of `null` records that the unfinished turn ended.
 */
const fxSessionStorageEntrySchema = z.object({
  entryId: z.string(),
  parentEntryId: z.string().optional(),
  data: z.object({
    provider: fxProviderSchema.optional(),
    checkpoint: z.string().optional(),
    turn: fxTurnStateSchema.nullable().optional(),
  }),
});

type FxSessionStorageEntryData = z.infer<
  typeof fxSessionStorageEntrySchema
>['data'];

export async function readFxSessionState({
  storage,
  sessionId,
  leafId,
  abortSignal,
}: {
  storage: FxSessionStorage;
  sessionId: string;
  leafId: string;
  abortSignal?: AbortSignal;
}): Promise<FxSessionState> {
  const values = await storage.read({ sessionId, leafId, abortSignal });
  const entries = new Map<
    string,
    z.infer<typeof fxSessionStorageEntrySchema>
  >();
  values.forEach((value, index) => {
    const result = fxSessionStorageEntrySchema.safeParse(value);
    if (!result.success) {
      throw new HarnessError({
        message: `Entry ${index} of the fx session "${sessionId}" is not an fx session entry.`,
        cause: result.error,
      });
    }
    entries.set(result.data.entryId, result.data);
  });

  const chain: FxSessionStorageEntryData[] = [];
  const visited = new Set<string>();
  let entryId: string | undefined = leafId;
  while (entryId != null) {
    if (visited.has(entryId)) {
      throw new HarnessError({
        message: `The entries of the fx session "${sessionId}" form a loop at entry "${entryId}".`,
      });
    }
    visited.add(entryId);
    const entry = entries.get(entryId);
    if (entry == null) {
      throw new HarnessError({
        message: `The session storage has no entry "${entryId}" for the fx session "${sessionId}".`,
      });
    }
    chain.unshift(entry.data);
    entryId = entry.parentEntryId;
  }

  const state: Record<string, unknown> = {};
  for (const data of chain) {
    if (data.provider !== undefined) state.provider = data.provider;
    if (data.checkpoint !== undefined) state.checkpoint = data.checkpoint;
    if (data.turn === null) delete state.turn;
    else if (data.turn !== undefined) state.turn = data.turn;
  }
  const result = fxSessionStateSchema.safeParse(state);
  if (!result.success) {
    throw new HarnessError({
      message: `The entries leading to "${leafId}" do not form an fx session for "${sessionId}".`,
      cause: result.error,
    });
  }
  return result.data as FxSessionState;
}

export function createFxSessionStorageWriter({
  storage,
  sessionId,
  leafId: initialLeafId,
  savedState,
}: {
  storage: FxSessionStorage;
  sessionId: string;
  leafId?: string;
  savedState?: FxSessionState;
}): {
  /**
   * Appends the changes since the last written state and resolves to the id
   * of the entry the session now ends at.
   */
  write(state: FxSessionState): Promise<string>;
} {
  type Saved = { provider: string; checkpoint?: string; turn?: string };
  const toSaved = (state: FxSessionState): Saved => ({
    provider: state.provider,
    checkpoint: state.checkpoint,
    turn: state.turn === undefined ? undefined : JSON.stringify(state.turn),
  });
  let leafId = initialLeafId;
  let saved = savedState === undefined ? undefined : toSaved(savedState);
  let writes: Promise<unknown> = Promise.resolve();

  return {
    write(state) {
      const snapshot = structuredClone(state);
      const next = writes.then(async () => {
        const current = toSaved(snapshot);
        const data: FxSessionStorageEntryData = {};
        if (saved?.provider !== current.provider) {
          data.provider = snapshot.provider;
        }
        if (
          current.checkpoint !== undefined &&
          saved?.checkpoint !== current.checkpoint
        ) {
          data.checkpoint = current.checkpoint;
        }
        if (saved?.turn !== current.turn) {
          data.turn = snapshot.turn === undefined ? null : snapshot.turn;
        }
        if (leafId != null && Object.keys(data).length === 0) return leafId;

        const entryId = randomUUID();
        await storage.append({
          sessionId,
          entry: {
            entryId,
            ...(leafId != null ? { parentEntryId: leafId } : {}),
            data: data as unknown as JSONObject,
          },
        });
        leafId = entryId;
        saved = current;
        return entryId;
      });
      writes = next.catch(() => {});
      return next;
    },
  };
}
