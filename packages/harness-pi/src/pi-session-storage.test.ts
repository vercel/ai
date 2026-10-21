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
import type { SessionStorage } from './pi-session-storage';
import {
  createFakePi,
  createThrowingSandboxSession,
  runPromptTurn,
  toolCallChunks,
  useScriptedPiModel,
} from './test-helpers';

const createMemoryStorage = () => {
  const parts = new Map<string, HarnessV1JSONValue>();
  const storage: SessionStorage = {
    append: async ({ sessionId, data }) => {
      const id = `${sessionId}/${parts.size}`;
      parts.set(id, structuredClone(data));
      return id;
    },
    read: async ({ ids }) => ids.map(id => parts.get(id)!),
  };
  return { parts, storage };
};

describe('Pi with a session storage', () => {
  const scripted = useScriptedPiModel();
  const sessionStart = {
    sessionId: 'session-pelican',
    sandboxSession: createThrowingSandboxSession(),
    sessionWorkDir: '/sandbox/work',
  };

  const start = (
    storage?: SessionStorage,
    resumeFrom?: HarnessV1ResumeSessionState,
  ) =>
    createFakePi(scripted.url, { sessionStorage: storage }).doStart({
      ...sessionStart,
      resumeFrom,
    });

  const runTurns = async (storage?: SessionStorage) => {
    const states: HarnessV1ResumeSessionState[] = [];
    for (const prompt of ['Remember PELICAN.', 'Also remember HERON.']) {
      const session = await start(storage, states.at(-1));
      await runPromptTurn(session, prompt);
      states.push(await session.doStop());
    }
    return states;
  };

  const firstRequestAfter = async (
    storage: SessionStorage | undefined,
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

  it('appends the entries each stop adds as one part and resumes from the ids', async () => {
    const { parts, storage } = createMemoryStorage();

    const [first, second] = await runTurns(storage);

    expect(first.data).toEqual({ partIds: ['session-pelican/0'] });
    expect(second.data).toEqual({
      partIds: ['session-pelican/0', 'session-pelican/1'],
    });
    const [part0, part1] = [...parts.values()].map(value =>
      piSessionEntriesSchema.parse(value),
    );
    expect(part1[0]).toMatchObject({ type: 'session', id: 'session-pelican' });
    const savedIds = [...part0.slice(1), ...part1.slice(1)].map(
      entry => entry.id,
    );
    expect(part1.length).toBeGreaterThan(1);
    expect(new Set(savedIds).size).toBe(savedIds.length);

    const [, inline] = await runTurns();
    expect(await firstRequestAfter(storage, second)).toEqual(
      await firstRequestAfter(undefined, inline),
    );
  });

  it('continues a suspended client tool call from the stored parts', async () => {
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
      partIds: ['session-heron/0'],
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

  it('ignores a part that no lifecycle state lists', async () => {
    const { parts, storage } = createMemoryStorage();
    const [first] = await runTurns(storage);

    const crashed = await start(storage, first);
    await runPromptTurn(crashed, 'An answer from a step that crashed.');
    await crashed.doStop();

    expect(parts.size).toBe(3);
    const request = await firstRequestAfter(storage, first);
    expect(JSON.stringify(request?.messages)).not.toContain(
      'An answer from a step that crashed.',
    );
  });

  it('appends no part when the session stops without new entries', async () => {
    const { parts, storage } = createMemoryStorage();
    const [state] = await runTurns(storage);
    const size = parts.size;

    const session = await start(storage, state);
    const stopped = await session.doStop();

    expect(stopped.data).toEqual(state.data);
    expect(parts.size).toBe(size);
  });

  it('appends a state recorded without a session storage as its first part', async () => {
    const { parts, storage } = createMemoryStorage();
    const [inline] = await runTurns();

    const session = await start(storage, inline);
    const stopped = await session.doStop();

    expect(stopped.data).toEqual({ partIds: ['session-pelican/0'] });
    expect(parts.get('session-pelican/0')).toEqual(
      piLifecycleStateSchema.parse(inline.data).entries,
    );
  });

  it('fails to start from parts without a session storage', async () => {
    const { storage } = createMemoryStorage();
    const [state] = await runTurns(storage);

    await expect(start(undefined, state)).rejects.toThrow(
      'createPi has no sessionStorage',
    );
  });

  it('fails to start from a part that is not a Pi session', async () => {
    const storage: SessionStorage = {
      append: async () => 'id',
      read: async () => [[{ type: 'message' }]],
    };

    await expect(
      start(storage, {
        type: 'resume-session',
        harnessId: 'pi',
        specificationVersion: 'harness-v1',
        data: { partIds: ['id'] },
      }),
    ).rejects.toThrow('The Pi session part "id" is not a Pi session.');
  });
});
