import { describe, expect, it } from 'vitest';
import type { FxSessionState, FxTurnState } from './fx-resume-state';
import {
  createFxSessionStorageWriter,
  readFxSessionState,
  type FxSessionStorage,
} from './fx-session-storage';

type Entry = Parameters<FxSessionStorage['append']>[0]['entry'];

function createMemoryStorage() {
  const entries: Entry[] = [];
  const storage: FxSessionStorage = {
    append: async ({ entry }) => {
      entries.push(structuredClone(entry));
    },
    read: async () => entries,
  };
  return { entries, storage };
}

function createTurn(): FxTurnState {
  return {
    id: 'turn-1',
    prompt: 'go',
    signature: 'signature',
    models: [],
    tools: [],
    emittedKeys: [],
    steers: [],
  };
}

describe('createFxSessionStorageWriter', () => {
  it('appends the whole state as the first entry', async () => {
    const { entries, storage } = createMemoryStorage();
    const writer = createFxSessionStorageWriter({
      storage,
      sessionId: 'session-1',
    });

    const leafId = await writer.write({
      provider: 'gateway',
      checkpoint: 'AQID',
      turn: createTurn(),
    });

    expect(entries).toEqual([
      {
        entryId: leafId,
        data: { provider: 'gateway', checkpoint: 'AQID', turn: createTurn() },
      },
    ]);
  });

  it('appends only the changed fields, linked to the previous entry', async () => {
    const { entries, storage } = createMemoryStorage();
    const writer = createFxSessionStorageWriter({
      storage,
      sessionId: 'session-1',
    });
    const state: FxSessionState = {
      provider: 'gateway',
      checkpoint: 'AQID',
      turn: createTurn(),
    };
    const first = await writer.write(state);
    state.turn!.emittedKeys.push('start');

    const second = await writer.write(state);

    expect(entries[1]).toEqual({
      entryId: second,
      parentEntryId: first,
      data: { turn: { ...createTurn(), emittedKeys: ['start'] } },
    });
  });

  it('records an ended turn and a new checkpoint', async () => {
    const { entries, storage } = createMemoryStorage();
    const writer = createFxSessionStorageWriter({
      storage,
      sessionId: 'session-1',
    });
    const state: FxSessionState = {
      provider: 'gateway',
      checkpoint: 'AQID',
      turn: createTurn(),
    };
    await writer.write(state);
    state.checkpoint = 'BAUG';
    state.turn = undefined;

    const leafId = await writer.write(state);

    expect(entries[1].data).toEqual({ checkpoint: 'BAUG', turn: null });
    expect(
      await readFxSessionState({ storage, sessionId: 'session-1', leafId }),
    ).toEqual({ provider: 'gateway', checkpoint: 'BAUG' });
  });

  it('appends nothing when the state did not change', async () => {
    const { entries, storage } = createMemoryStorage();
    const writer = createFxSessionStorageWriter({
      storage,
      sessionId: 'session-1',
    });
    const state: FxSessionState = { provider: 'gateway', checkpoint: 'AQID' };
    const first = await writer.write(state);

    expect(await writer.write(state)).toBe(first);
    expect(entries).toHaveLength(1);
  });

  it('continues from a restored leaf', async () => {
    const { entries, storage } = createMemoryStorage();
    const savedState: FxSessionState = {
      provider: 'gateway',
      checkpoint: 'AQID',
    };
    const writer = createFxSessionStorageWriter({
      storage,
      sessionId: 'session-1',
      leafId: 'restored',
      savedState,
    });

    expect(await writer.write(savedState)).toBe('restored');
    await writer.write({ ...savedState, turn: createTurn() });

    expect(entries).toEqual([
      {
        entryId: expect.any(String),
        parentEntryId: 'restored',
        data: { turn: createTurn() },
      },
    ]);
  });

  it('writes the state as it was when write was called', async () => {
    const { entries, storage } = createMemoryStorage();
    const writer = createFxSessionStorageWriter({
      storage,
      sessionId: 'session-1',
    });
    const state: FxSessionState = { provider: 'gateway', turn: createTurn() };

    const written = writer.write(state);
    state.turn!.emittedKeys.push('later');
    await written;

    expect(entries[0].data).toEqual({
      provider: 'gateway',
      turn: createTurn(),
    });
  });
});

describe('readFxSessionState', () => {
  it('folds only the entries leading to the leaf, in any order', async () => {
    const storage: FxSessionStorage = {
      append: async () => {},
      read: async () => [
        { entryId: 'b', parentEntryId: 'a', data: { checkpoint: 'Ag==' } },
        { entryId: 'other', parentEntryId: 'a', data: { checkpoint: 'Aw==' } },
        { entryId: 'a', data: { provider: 'codex', checkpoint: 'AQ==' } },
      ],
    };

    expect(
      await readFxSessionState({
        storage,
        sessionId: 'session-1',
        leafId: 'b',
      }),
    ).toEqual({ provider: 'codex', checkpoint: 'Ag==' });
  });

  it('passes the abort signal to the storage', async () => {
    const abortSignal = new AbortController().signal;
    let received: AbortSignal | undefined;
    const storage: FxSessionStorage = {
      append: async () => {},
      read: async options => {
        received = options.abortSignal;
        return [{ entryId: 'a', data: { provider: 'gateway' } }];
      },
    };

    await readFxSessionState({
      storage,
      sessionId: 'session-1',
      leafId: 'a',
      abortSignal,
    });

    expect(received).toBe(abortSignal);
  });

  it.each([
    {
      name: 'an entry that is not an fx session entry',
      entries: [{ entryId: 'a', data: { provider: 'unknown' } }],
      error:
        'Entry 0 of the fx session "session-1" is not an fx session entry.',
    },
    {
      name: 'a missing leaf',
      entries: [{ entryId: 'a', data: { provider: 'gateway' } }],
      leafId: 'missing',
      error:
        'The session storage has no entry "missing" for the fx session "session-1".',
    },
    {
      name: 'a missing parent',
      entries: [{ entryId: 'a', parentEntryId: 'gone', data: {} }],
      error:
        'The session storage has no entry "gone" for the fx session "session-1".',
    },
    {
      name: 'a loop',
      entries: [
        { entryId: 'a', parentEntryId: 'b', data: {} },
        { entryId: 'b', parentEntryId: 'a', data: {} },
      ],
      error:
        'The entries of the fx session "session-1" form a loop at entry "a".',
    },
    {
      name: 'a chain without a provider',
      entries: [{ entryId: 'a', data: { checkpoint: 'AQ==' } }],
      error:
        'The entries leading to "a" do not form an fx session for "session-1".',
    },
  ])('fails on $name', async ({ entries, leafId = 'a', error }) => {
    const storage = {
      append: async () => {},
      read: async () => entries,
    } as unknown as FxSessionStorage;

    await expect(
      readFxSessionState({ storage, sessionId: 'session-1', leafId }),
    ).rejects.toThrow(error);
  });
});
