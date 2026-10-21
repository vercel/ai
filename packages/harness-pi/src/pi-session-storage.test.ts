import type {
  HarnessV1JSONValue,
  HarnessV1ResumeSessionState,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from '@ai-sdk/provider-utils';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  piLifecycleStateSchema,
  piSessionEntriesSchema,
} from './pi-lifecycle-state';
import type { PiSessionStorage } from './pi-session-storage';
import {
  createFakePi,
  createThrowingSandboxSession,
  runPromptTurn,
  toolCallChunks,
  useScriptedPiModel,
} from './test-helpers';

const createMemoryStorage = () => {
  const logs = new Map<string, HarnessV1JSONValue[]>();
  const storage: PiSessionStorage = {
    append: async ({ sessionId, data }) => {
      if (!logs.has(sessionId)) logs.set(sessionId, []);
      logs.get(sessionId)!.push(structuredClone(data));
    },
    read: async ({ sessionId }) => logs.get(sessionId) ?? [],
  };
  return { logs, storage };
};

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

  it('appends the entries each stop adds as one part and resumes from the leaf', async () => {
    const { logs, storage } = createMemoryStorage();

    const [first, second] = await runTurns(storage);

    expect(first.data).toEqual({ leafId: expect.any(String) });
    expect(second.data).toEqual({ leafId: expect.any(String) });
    const [part0, part1] = logs
      .get('session-pelican')!
      .map(value => piSessionEntriesSchema.parse(value));
    expect(part1[0]).toMatchObject({ type: 'session', id: 'session-pelican' });
    const savedIds = [...part0.slice(1), ...part1.slice(1)].map(
      entry => entry.id,
    );
    expect(part1.length).toBeGreaterThan(1);
    expect(new Set(savedIds).size).toBe(savedIds.length);
    expect(savedIds.at(-1)).toBe(
      piLifecycleStateSchema.parse(second.data).leafId,
    );

    const [, inline] = await runTurns();
    expect(await firstRequestAfter(storage, second)).toEqual(
      await firstRequestAfter(undefined, inline),
    );
  });

  it('keeps a turn resumed from an earlier state on its own branch', async () => {
    const { logs, storage } = createMemoryStorage();
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

    expect(logs.get('session-pelican')).toHaveLength(3);
    const request = JSON.stringify(
      (await firstRequestAfter(storage, regenerated))?.messages,
    );
    expect(request).toContain('Remember PELICAN.');
    expect(request).toContain('The regenerated answer.');
    expect(request).not.toContain('The answer that was dropped.');
    expect(
      JSON.stringify((await firstRequestAfter(storage, dropped))?.messages),
    ).not.toContain('The regenerated answer.');
  });

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

  it('appends no part when the session stops without new entries', async () => {
    const { logs, storage } = createMemoryStorage();
    const [state] = await runTurns(storage);
    const size = logs.get('session-pelican')!.length;

    const session = await start(storage, state);
    const stopped = await session.doStop();

    expect(stopped.data).toEqual(state.data);
    expect(logs.get('session-pelican')).toHaveLength(size);
  });

  it('appends a state recorded without a session storage as its first part', async () => {
    const { logs, storage } = createMemoryStorage();
    const [inline] = await runTurns();

    const session = await start(storage, inline);
    const stopped = await session.doStop();

    const entries = piLifecycleStateSchema.parse(inline.data).entries!;
    expect(stopped.data).toEqual({ leafId: entries.at(-1)!.id });
    expect(logs.get('session-pelican')).toEqual([entries]);
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

  it('fails to start from a part that is not a Pi session', async () => {
    const storage: PiSessionStorage = {
      append: async () => {},
      read: async () => [[{ type: 'message' }]],
    };

    await expect(start(storage, resumeAt('any'))).rejects.toThrow(
      'Part 0 of the Pi session "session-pelican"',
    );
  });
});
