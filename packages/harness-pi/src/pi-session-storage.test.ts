import type { HarnessV1ResumeSessionState } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from '@ai-sdk/provider-utils';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  CURRENT_SESSION_VERSION,
  type SessionEntry,
} from '@earendil-works/pi-coding-agent';
import { piResumeStateSchema } from './pi-resume-state';
import {
  type PiSessionStorage,
  readSessionEntries,
} from './pi-session-storage';
import {
  createFakePi,
  createThrowingSandboxSession,
  runPromptTurn,
  toolCallChunks,
  useScriptedPiModel,
} from './test-helpers';

type StoredEntry = Parameters<PiSessionStorage['append']>[0]['entry'];

const pathTo = (log: Map<string, StoredEntry>, leafId: string) => {
  const path: StoredEntry[] = [];
  for (let id: string | undefined = leafId; id != null; ) {
    const entry = log.get(id);
    if (entry == null) break;
    path.push(entry);
    id = entry.parentEntryId;
  }
  return path.reverse();
};

const createMemoryStorage = ({ readAll = false, batch = false } = {}) => {
  const logs = new Map<string, Map<string, StoredEntry>>();
  const calls = { append: 0, appendMany: 0 };
  const getLog = (sessionId: string) => {
    if (!logs.has(sessionId)) logs.set(sessionId, new Map());
    return logs.get(sessionId)!;
  };
  const add = (sessionId: string, entry: StoredEntry) => {
    const log = getLog(sessionId);
    if (!log.has(entry.entryId)) {
      log.set(entry.entryId, { ...entry, data: structuredClone(entry.data) });
    }
  };
  const storage: PiSessionStorage = {
    append: async ({ sessionId, entry }) => {
      calls.append++;
      add(sessionId, entry);
    },
    ...(batch && {
      appendMany: async ({ sessionId, entries }) => {
        calls.appendMany++;
        for (const entry of entries) add(sessionId, entry);
      },
    }),
    read: async ({ sessionId, leafId }) =>
      readAll
        ? [...getLog(sessionId).values()]
        : pathTo(getLog(sessionId), leafId),
  };
  const entriesOf = (sessionId: string) => [...getLog(sessionId).values()];
  return { calls, entriesOf, storage };
};

const leafOf = (state: { data: unknown }) =>
  piResumeStateSchema.parse(state.data).leafId;

describe('Pi with a session storage', () => {
  const scripted = useScriptedPiModel();
  const sessionStart = {
    sessionId: 'session-pelican',
    sandboxSession: createThrowingSandboxSession(),
    sessionWorkDir: '/sandbox/work',
  };

  const start = (
    storage?: PiSessionStorage,
    resumeFrom?: HarnessV1ResumeSessionState,
  ) =>
    createFakePi(scripted.url, { sessionStorage: storage }).doStart({
      ...sessionStart,
      resumeFrom,
    });

  const runTurn = async (
    storage: PiSessionStorage | undefined,
    resumeFrom: HarnessV1ResumeSessionState | undefined,
    prompt: string,
  ) => {
    const session = await start(storage, resumeFrom);
    await runPromptTurn(session, prompt);
    return session.doStop();
  };

  const runTurns = async (storage?: PiSessionStorage) => {
    const first = await runTurn(storage, undefined, 'Remember PELICAN.');
    const second = await runTurn(storage, first, 'Also remember HERON.');
    return [first, second];
  };

  const resumeAt = (leafId: string): HarnessV1ResumeSessionState => ({
    type: 'resume-session',
    harnessId: 'pi',
    specificationVersion: 'harness-v1',
    data: { leafId },
  });

  const firstRequestAfter = async (
    storage: PiSessionStorage | undefined,
    resumeFrom: HarnessV1ResumeSessionState,
  ) => {
    const before = scripted.model.requests.length;
    const session = await start(storage, resumeFrom);
    try {
      await runPromptTurn(session, 'Which words did I ask you to remember?');
    } finally {
      await session.doDestroy();
    }
    return scripted.model.requests[before];
  };

  it('appends each new entry with its parent and resumes from the leaf', async () => {
    const { calls, entriesOf, storage } = createMemoryStorage();

    const [first, second] = await runTurns(storage);

    expect(first.data).toEqual({ leafId: expect.any(String) });
    expect(second.data).toEqual({ leafId: expect.any(String) });
    const log = entriesOf('session-pelican');
    expect(calls.append).toBe(log.length);
    for (const { entryId, parentEntryId, version, data } of log) {
      expect(version).toBe(CURRENT_SESSION_VERSION);
      expect(data).toMatchObject({
        id: entryId,
        parentId: parentEntryId ?? null,
      });
    }
    expect(log[0].parentEntryId).toBeUndefined();
    expect(log.at(-1)!.entryId).toBe(leafOf(second));

    const [, inline] = await runTurns();
    expect(await firstRequestAfter(storage, second)).toEqual(
      await firstRequestAfter(undefined, inline),
    );
  });

  it('appends the entries of each stop in one call when the storage has appendMany', async () => {
    const { calls, entriesOf, storage } = createMemoryStorage({ batch: true });

    const [, second] = await runTurns(storage);

    expect(calls).toEqual({ append: 0, appendMany: 2 });
    expect(entriesOf('session-pelican').at(-1)!.entryId).toBe(leafOf(second));
  });

  it.each([
    { name: 'the path to the leaf', readAll: false },
    { name: 'every branch', readAll: true },
  ])(
    'keeps a turn resumed from an earlier state on its own branch when the storage reads $name',
    async ({ readAll }) => {
      const { entriesOf, storage } = createMemoryStorage({ readAll });
      const first = await runTurn(storage, undefined, 'Remember PELICAN.');

      const dropped = await runTurn(
        storage,
        first,
        'The answer that was dropped.',
      );
      const regenerated = await runTurn(
        storage,
        first,
        'The regenerated answer.',
      );

      expect(
        entriesOf('session-pelican').filter(
          entry => entry.parentEntryId === leafOf(first),
        ),
      ).toHaveLength(2);
      const request = JSON.stringify(
        (await firstRequestAfter(storage, regenerated))?.messages,
      );
      expect(request).toContain('Remember PELICAN.');
      expect(request).toContain('The regenerated answer.');
      expect(request).not.toContain('The answer that was dropped.');
      expect(
        JSON.stringify((await firstRequestAfter(storage, dropped))?.messages),
      ).not.toContain('The regenerated answer.');
    },
  );

  it('continues a suspended client tool call from the log', async () => {
    const { storage } = createMemoryStorage();
    const sandboxSession = await createJustBashSandbox({
      cwd: '/sandbox/work',
    }).createSession();
    const newAgent = () =>
      new HarnessAgent({
        harness: createFakePi(scripted.url, {
          sessionStorage: storage,
          reattachInProcess: false,
        }),
        model: 'fake/fake-model',
        tools: {
          getUserName: tool({
            description: 'Ask the user for their name.',
            inputSchema: z.object({}),
          }),
        },
      });
    scripted.model.enqueue(toolCallChunks('getUserName', {}));

    const agent = newAgent();
    const session = await agent.createSession({
      sandboxSession,
      sessionId: 'session-heron',
    });
    await (
      await agent.stream({ session, prompt: 'Ask me for my name.' })
    ).consumeStream();
    const continueFrom = await session.suspendTurn();

    expect(continueFrom.data).toMatchObject({
      leafId: expect.any(String),
      pendingToolBatch: { awaitingToolCallIds: ['call-getUserName'] },
    });
    expect(continueFrom.data).not.toHaveProperty('entries');

    const before = scripted.model.requests.length;
    const resumedAgent = newAgent();
    const resumed = await resumedAgent.createSession({
      sandboxSession,
      sessionId: 'session-heron',
      continueFrom,
    });
    try {
      await (
        await resumedAgent.continueStream({
          session: resumed,
          toolResultContinuations: [
            {
              type: 'tool-result',
              toolCallId: 'call-getUserName',
              toolName: 'getUserName',
              output: { type: 'json', value: { name: 'Felix' } },
            },
          ],
        })
      ).consumeStream();
    } finally {
      await resumed.stop();
    }

    const request = JSON.stringify(scripted.model.requests[before]?.messages);
    expect(request).toContain('Ask me for my name.');
    expect(request).toContain('Felix');
  });

  it('appends nothing when the session stops without new entries', async () => {
    const { entriesOf, storage } = createMemoryStorage();
    const [state] = await runTurns(storage);
    const size = entriesOf('session-pelican').length;

    const session = await start(storage, state);
    const stopped = await session.doStop();

    expect(stopped.data).toEqual(state.data);
    expect(entriesOf('session-pelican')).toHaveLength(size);
  });

  it('appends the entries of a state recorded without a session storage', async () => {
    const { entriesOf, storage } = createMemoryStorage();
    const [inline] = await runTurns();

    const session = await start(storage, inline);
    const stopped = await session.doStop();

    const [header, ...entries] = piResumeStateSchema.parse(
      inline.data,
    ).entries!;
    expect(stopped.data).toEqual({ leafId: entries.at(-1)!.id });
    expect(
      entriesOf('session-pelican').map(({ version, data }) => ({
        version,
        data,
      })),
    ).toEqual(entries.map(data => ({ version: header.version, data })));
  });

  it('fails to start from a log without a session storage', async () => {
    const { storage } = createMemoryStorage();
    const [state] = await runTurns(storage);

    await expect(start(undefined, state)).rejects.toThrow(
      'createPi has no sessionStorage',
    );
  });

  it('fails to start from a leaf the log does not hold', async () => {
    const { storage } = createMemoryStorage();
    await runTurns(storage);

    await expect(start(storage, resumeAt('missing'))).rejects.toThrow(
      'has no entry "missing"',
    );
  });

  it('fails to start from an entry that is not a Pi session entry', async () => {
    const storage: PiSessionStorage = {
      append: async () => {},
      read: async () => [
        {
          entryId: 'any',
          version: CURRENT_SESSION_VERSION,
          data: { type: 'session' } as unknown as SessionEntry,
        },
      ],
    };

    await expect(start(storage, resumeAt('any'))).rejects.toThrow(
      'Entry 0 of the Pi session "session-pelican"',
    );
  });

  it('migrates each entry from the session version it was written under', async () => {
    const stored = {
      entryId: 'a1b2c3d4',
      version: 2,
      data: {
        type: 'message',
        id: 'a1b2c3d4',
        parentId: null,
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { role: 'hookMessage', content: 'from a hook' },
      } as unknown as SessionEntry,
    };
    const storage: PiSessionStorage = {
      append: async () => {},
      read: async () => [stored],
    };

    const [entry] = await readSessionEntries({
      storage,
      sessionId: 'session-pelican',
      leafId: 'a1b2c3d4',
    });

    expect(entry).toMatchObject({ message: { role: 'custom' } });
    expect(stored.data).toMatchObject({ message: { role: 'hookMessage' } });
  });
});
