import type {
  HarnessV2,
  HarnessV2DriveContext,
  HarnessV2TurnSettings,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { DelayedPromise, tool, type ToolSet } from '@ai-sdk/provider-utils';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxToolCall,
  type Message,
} from '@earendil-works/pi-ai';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod/v4';
import { PI_BUILTIN_TOOLS } from './pi-builtin-tools';
import { PiDrive, toPiUserMessage } from './pi-drive';
import { hasPendingCancel, readPiLogState } from './pi-log-state';
import { createTestModelRuntime, createTestMcpServer } from './test-helpers';

/**
 * Creates a session of a `HarnessAgent` whose drives run `PiDrive` with a
 * faux model. The agent, its log and its effects are real; `wrapContext`
 * lets a test change what the adapter sees of a drive's context, e.g. to
 * stop the drive midway, which the agent itself only does once a drive
 * ended.
 */
async function setup(
  options: {
    tools?: ToolSet;
    mcpServers?: HarnessV2TurnSettings['mcpServers'];
    toolApproval?: Record<string, 'user-approval' | 'approved' | 'denied'>;
  } = {},
) {
  const runtime = createTestModelRuntime();
  const contexts: HarnessV2DriveContext[] = [];
  const hooks: {
    wrapContext?: (context: HarnessV2DriveContext) => HarnessV2DriveContext;
  } = {};
  const harness: HarnessV2<typeof PI_BUILTIN_TOOLS> = {
    specificationVersion: 'harness-v2',
    harnessId: 'pi',
    builtinTools: PI_BUILTIN_TOOLS,
    async drive({ sessionId, context }) {
      const driveContext = hooks.wrapContext?.(context) ?? context;
      contexts.push(driveContext);
      await new PiDrive({ sessionId, context: driveContext, runtime }).run();
    },
  };
  const sandboxSession = await createJustBashNetworkSandboxSession({
    sandboxId: 'sandbox-1',
  });
  const agent = new HarnessAgent({
    harness,
    tools: options.tools ?? {},
    mcpServers: options.mcpServers,
    toolApproval: options.toolApproval,
    sandboxConfig: { workDir: 'project' },
    getSandboxSession: async () => sandboxSession,
  });
  const session = await agent.createSession({ sandboxSession });
  return {
    agent,
    session,
    runtime,
    hooks,
    log: () => contexts.at(-1)!.log,
    readState: () => readPiLogState({ log: contexts.at(-1)!.log }),
    readFile: (path: string) =>
      sandboxSession.readTextFile({
        path: `${sandboxSession.defaultWorkingDirectory}/project/${path}`,
      }),
  };
}

/**
 * Returns a drive context whose drive the adapter sees stop once `stopAbortSignal`
 * aborts.
 */
function withStop(options: {
  context: HarnessV2DriveContext;
  stopAbortSignal: AbortSignal;
}): HarnessV2DriveContext {
  return {
    ...options.context,
    stopAbortSignal: AbortSignal.any([
      options.context.stopAbortSignal,
      options.stopAbortSignal,
    ]),
  };
}

/**
 * Returns a drive context whose drive the adapter sees stop right after the
 * first step finished, leaving the turn unfinished.
 */
function stopAfterFirstStep(
  context: HarnessV2DriveContext,
): HarnessV2DriveContext {
  const stop = new AbortController();
  return {
    ...withStop({ context, stopAbortSignal: stop.signal }),
    finishStep: async step => {
      await context.finishStep(step);
      stop.abort();
    },
  };
}

describe('toPiUserMessage', () => {
  test('keeps a text-only message as a string', () => {
    expect(
      toPiUserMessage({
        message: { role: 'user', content: 'Hello' },
        timestamp: 1,
      }),
    ).toMatchInlineSnapshot(`
      {
        "content": "Hello",
        "role": "user",
        "timestamp": 1,
      }
    `);
  });

  test('converts an image file part with a data URL to Pi image content', () => {
    expect(
      toPiUserMessage({
        message: {
          role: 'user',
          content: [
            { type: 'text', text: "What's in the picture?" },
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL('data:image/png;base64,iVBORw=='),
              },
            },
          ],
        },
        timestamp: 1,
      }),
    ).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "What's in the picture?",
            "type": "text",
          },
          {
            "data": "iVBORw==",
            "mimeType": "image/png",
            "type": "image",
          },
        ],
        "role": "user",
        "timestamp": 1,
      }
    `);
  });

  test('rejects a remote image URL', () => {
    expect(() =>
      toPiUserMessage({
        message: {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: new URL('https://example.com/image.png'),
            },
          ],
        },
        timestamp: 1,
      }),
    ).toThrow('remote image URLs');
  });
});

describe('PiDrive', () => {
  test('prefers a host tool over a matching MCP name and rediscovers each turn', async () => {
    const server = await createTestMcpServer();
    const execute = vi.fn(async () => 'host result');
    try {
      const { agent, session, runtime } = await setup({
        mcpServers: { remote: { url: server.url } },
        tools: {
          mcp__remote__lookup: tool({
            inputSchema: z.object({ query: z.string() }),
            execute,
          }),
        },
      });
      runtime.faux.setResponses([
        fauxAssistantMessage(
          [fauxToolCall('mcp__remote__lookup', { query: 'test' })],
          { stopReason: 'toolUse' },
        ),
        fauxAssistantMessage('done'),
        fauxAssistantMessage('next'),
      ]);
      const result = await agent.generate({ prompt: 'lookup', session });
      expect(result.text).toBe('done');
      expect(execute).toHaveBeenCalledOnce();
      expect(
        server.requests.filter(request => request.method === 'tools/call'),
      ).toHaveLength(0);
      await agent.generate({ prompt: 'next', session });
      expect(
        server.requests.filter(request => request.method === 'tools/list'),
      ).toHaveLength(2);
      expect(server.deletes).toBe(2);
    } finally {
      await server.close();
    }
  });

  test.each(['tools/list', 'tools/call'])(
    'cancels MCP work during %s',
    async method => {
      let cancel!: () => Promise<void>;
      const server = await createTestMcpServer({
        handle: async request => {
          if (request.method === method) {
            await cancel();
            return new Promise(() => {});
          }
        },
      });
      try {
        const { agent, session, runtime, log } = await setup({
          mcpServers: { remote: { url: server.url } },
        });
        cancel = () => agent.cancel({ session });
        runtime.faux.setResponses([
          fauxAssistantMessage(
            [
              fauxToolCall(
                'mcp__remote__lookup',
                { query: 'test' },
                { id: 'mcp-1' },
              ),
            ],
            { stopReason: 'toolUse' },
          ),
        ]);
        const result = await agent.stream({ prompt: 'lookup', session });
        if (method === 'tools/call')
          expect(await result.rawFinishReason).toBe('cancelled');
        else await result.consumeStream();
        const key = method === 'tools/list' ? 'mcp-discovery:' : 'tool:';
        const effect = log().getEffects({ keyPrefix: key })[0];
        expect(effect.end?.data.output).toEqual({
          type: 'interrupted',
          retryable: method === 'tools/list',
        });
        expect(log().getCurrentTurn()?.finish?.data.finishReason.unified).toBe(
          'cancelled',
        );
      } finally {
        await server.close();
      }
    },
  );

  test('replays MCP discovery and calls without reconnecting after a stopped step', async () => {
    const server = await createTestMcpServer();
    try {
      const { agent, session, runtime, hooks, log } = await setup({
        mcpServers: { remote: { url: server.url } },
      });
      runtime.faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall(
              'mcp__remote__lookup',
              { query: 'test' },
              { id: 'mcp-1' },
            ),
          ],
          { stopReason: 'toolUse' },
        ),
      ]);
      hooks.wrapContext = stopAfterFirstStep;
      await (await agent.stream({ prompt: 'lookup', session })).consumeStream();
      expect(
        log().getEffect({ key: 'tool:mcp-1' })?.end?.data.output.type,
      ).toBe('result');
      expect(
        server.requests.filter(request => request.method === 'tools/call')
          .length,
      ).toBe(1);
      await server.close();
      hooks.wrapContext = undefined;
      runtime.faux.setResponses([
        context => {
          expect(JSON.stringify(context.messages)).toContain('remote result');
          expect(JSON.stringify(context.messages)).toContain(
            'Test MCP instructions',
          );
          return fauxAssistantMessage('done');
        },
      ]);
      const reading = await agent.readStream({ session });
      await agent.drive({ session });
      expect(await reading.text).toBe('done');
      expect(
        (await reading.steps)
          .flatMap(step => step.toolCalls)
          .map(call => call.dynamic),
      ).toEqual([true]);
      expect(
        server.requests.filter(request => request.method === 'tools/list')
          .length,
      ).toBe(1);
    } finally {
      await server.close();
    }
  });

  test('resumes after discovery committed but before the first model call', async () => {
    const server = await createTestMcpServer();
    try {
      const { agent, session, runtime, hooks, readState } = await setup({
        mcpServers: { remote: { url: server.url } },
      });
      const stop = new AbortController();
      hooks.wrapContext = context => ({
        ...withStop({ context, stopAbortSignal: stop.signal }),
        effect: async options => {
          const output = await context.effect(options);
          if (options.name === 'mcp.discovery') stop.abort();
          return output;
        },
      });
      await (await agent.stream({ prompt: 'hello', session })).consumeStream();
      expect(readState().currentTurn?.ended).toBe(false);
      expect(readState().modelEffects).toHaveLength(0);
      await server.close();
      hooks.wrapContext = undefined;
      runtime.faux.setResponses([fauxAssistantMessage('resumed')]);
      const reading = await agent.readStream({ session });
      await agent.drive({ session });
      expect(await reading.text).toBe('resumed');
      expect(readState().currentTurn?.ended).toBe(true);
    } finally {
      await server.close();
    }
  });

  test('finishes failed discovery without a model step and accepts the next prompt', async () => {
    let fail = true;
    const server = await createTestMcpServer({
      handle: request => {
        if (fail && request.method === 'tools/list')
          throw new Error('MCP unavailable');
      },
    });
    try {
      const { agent, session, runtime, readState } = await setup({
        mcpServers: { remote: { url: server.url } },
      });
      await (await agent.stream({ prompt: 'first', session })).consumeStream();
      expect(readState().currentTurn?.ended).toBe(true);
      expect(readState().modelEffects).toHaveLength(0);
      fail = false;
      runtime.faux.setResponses([fauxAssistantMessage('next')]);
      expect((await agent.generate({ prompt: 'second', session })).text).toBe(
        'next',
      );
    } finally {
      await server.close();
    }
  });

  test('runs a text-only turn', async () => {
    const { agent, session, runtime, readState } = await setup();
    runtime.faux.setResponses([fauxAssistantMessage('Hello there')]);

    const result = await agent.generate({ prompt: 'hi', session });

    expect(result.text).toBe('Hello there');
    expect(result.steps.map(step => step.finishReason)).toEqual(['stop']);
    const state = readState();
    expect(state.modelEffects).toMatchObject([
      { ordinal: 0, deliveredSubmissionIds: [state.prompts[0].id] },
    ]);
    expect(state.pendingPrompts).toEqual([]);
    expect(state.currentTurn).toMatchObject({
      firstModelOrdinal: 0,
      ended: true,
    });
  });

  test('runs a built-in tool and a host tool across steps', async () => {
    const { agent, session, runtime, readState, readFile } = await setup({
      tools: {
        weather: tool({
          description: 'Weather',
          inputSchema: z.object({ city: z.string() }),
          execute: async () => ({ forecast: 'sunny' }),
        }),
      },
    });
    runtime.faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            'write',
            { path: 'a.txt', content: 'hello' },
            { id: 'call-1' },
          ),
        ],
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage(
        [fauxToolCall('weather', { city: 'Berlin' }, { id: 'call-2' })],
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage('Done'),
    ]);

    const result = await agent.generate({ prompt: 'write a file', session });

    expect(await readFile('a.txt')).toBe('hello');
    expect(result.text).toBe('Done');
    expect(result.steps.map(step => step.finishReason)).toEqual([
      'tool-calls',
      'tool-calls',
      'stop',
    ]);
    expect(result.steps.flatMap(step => step.toolCalls)).toMatchObject([
      {
        toolCallId: 'call-1',
        toolName: 'write',
        input: { path: 'a.txt', content: 'hello' },
        providerExecuted: true,
      },
      { toolCallId: 'call-2', toolName: 'weather', input: { city: 'Berlin' } },
    ]);
    const state = readState();
    expect(state.toolOutputs.get('call-2')).toEqual({
      type: 'result',
      value: { raw: { forecast: 'sunny' } },
    });
    expect(state.modelEffects[2].input.appended).toMatchObject([
      {
        role: 'toolResult',
        toolCallId: 'call-2',
        content: [{ type: 'text', text: '{"forecast":"sunny"}' }],
      },
    ]);
  });

  test('sums the usage of a turn across its steps', async () => {
    const { agent, session, runtime } = await setup();
    runtime.faux.setResponses([
      fauxAssistantMessage([fauxToolCall('ls', {}, { id: 'call-1' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage('Done'),
    ]);

    const result = await agent.generate({ prompt: 'list', session });

    const [first, second] = result.steps.map(step => step.usage);
    expect(first.inputTokens).toBeGreaterThan(0);
    expect(result.totalUsage.inputTokens).toBe(
      first.inputTokens! + second.inputTokens!,
    );
    expect(result.totalUsage.outputTokens).toBe(
      first.outputTokens! + second.outputTokens!,
    );
  });

  test('finishes the turn with an error after three failed model attempts', async () => {
    const { agent, session, runtime, readState } = await setup();
    const failure = fauxAssistantMessage('', {
      stopReason: 'error',
      errorMessage: 'provider unavailable',
    });
    runtime.faux.setResponses([failure, failure, failure]);

    const result = await agent.stream({ prompt: 'hi', session });
    const errors: unknown[] = [];
    for await (const part of result.fullStream) {
      if (part.type === 'error') errors.push(part.error);
    }

    expect(runtime.faux.state.callCount).toBe(3);
    expect(errors).toMatchObject([{ message: 'provider unavailable' }]);
    expect(await result.finishReason).toBe('error');
    expect(readState().modelEffects[0].output).toEqual({
      type: 'error',
      error: { message: 'Error: provider unavailable' },
    });
  });

  test('resumes an unfinished turn without repeating recorded work', async () => {
    const { agent, session, runtime, hooks, readState, readFile } =
      await setup();
    runtime.faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            'bash',
            { command: 'echo run >> runs.txt' },
            { id: 'call-1' },
          ),
        ],
        { stopReason: 'toolUse' },
      ),
    ]);
    hooks.wrapContext = stopAfterFirstStep;
    await (await agent.stream({ prompt: 'run it', session })).consumeStream();

    expect(runtime.faux.state.callCount).toBe(1);
    expect(readState().currentTurn?.ended).toBe(false);

    hooks.wrapContext = undefined;
    let resumedContext: Message[] = [];
    runtime.faux.setResponses([
      context => {
        resumedContext = context.messages;
        return fauxAssistantMessage('All done');
      },
    ]);
    const reading = await agent.readStream({ session });
    await agent.drive({ session });

    expect(await reading.text).toBe('All done');
    expect((await reading.steps).map(step => step.finishReason)).toEqual([
      'tool-calls',
      'stop',
    ]);
    expect(runtime.faux.state.callCount).toBe(2);
    expect(resumedContext.map(message => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'toolResult',
    ]);
    expect(await readFile('runs.txt')).toBe('run\n');
    expect(readState().modelEffects.map(record => record.ordinal)).toEqual([
      0, 1,
    ]);
  });

  test('halts without finishing the turn when the drive stops', async () => {
    const stop = new AbortController();
    const { agent, session, runtime, hooks, readState } = await setup({
      tools: {
        slow: tool({
          inputSchema: z.object({}),
          execute: async () => {
            stop.abort();
            return 'late';
          },
        }),
      },
    });
    runtime.faux.setResponses([
      fauxAssistantMessage([fauxToolCall('slow', {}, { id: 'call-1' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage('never'),
    ]);
    hooks.wrapContext = context =>
      withStop({ context, stopAbortSignal: stop.signal });

    await (await agent.stream({ prompt: 'go', session })).consumeStream();

    expect(runtime.faux.state.callCount).toBe(1);
    expect(readState().currentTurn?.ended).toBe(false);
  });

  test('starts no new turn once the drive yields', async () => {
    const { agent, session, runtime, hooks, readState } = await setup();
    hooks.wrapContext = context => ({
      ...context,
      yieldAbortSignal: AbortSignal.any([
        context.yieldAbortSignal,
        AbortSignal.abort(),
      ]),
    });

    await (await agent.stream({ prompt: 'hi', session })).consumeStream();

    expect(runtime.faux.state.callCount).toBe(0);
    expect(readState().pendingPrompts).toHaveLength(1);

    hooks.wrapContext = undefined;
    runtime.faux.setResponses([fauxAssistantMessage('Hello')]);
    await agent.drive({ session });

    expect(await (await agent.readStream({ session })).text).toBe('Hello');
  });

  test('continues a session in a later drive', async () => {
    const { agent, session, runtime, readState } = await setup();
    let context: Message[] = [];
    runtime.faux.setResponses([
      fauxAssistantMessage('first answer'),
      request => {
        context = request.messages;
        return fauxAssistantMessage('second answer');
      },
    ]);

    await agent.generate({ prompt: 'first', session });
    const result = await agent.generate({ prompt: 'second', session });

    expect(result.text).toBe('second answer');
    expect(result.steps).toHaveLength(1);
    expect(context).toMatchObject([
      { role: 'system' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: 'second' },
    ]);
    expect(readState().modelEffects[1].input.appended).toMatchObject([
      { role: 'user', content: 'second' },
    ]);
  });

  test('rethrows a rejected drive context call', async () => {
    const { agent, session, runtime, hooks } = await setup();
    runtime.faux.setResponses([fauxAssistantMessage('Hello')]);
    hooks.wrapContext = context => ({
      ...context,
      finishStep: async () => {
        throw new Error('log unavailable');
      },
    });

    await expect(agent.generate({ prompt: 'hi', session })).rejects.toThrow(
      'log unavailable',
    );
  });

  test('fails the drive when a replayed model call diverges from the log', async () => {
    const { agent, session, runtime, hooks } = await setup();
    runtime.faux.setResponses([
      fauxAssistantMessage([fauxToolCall('ls', {}, { id: 'call-1' })], {
        stopReason: 'toolUse',
      }),
    ]);
    hooks.wrapContext = stopAfterFirstStep;
    await (await agent.stream({ prompt: 'list', session })).consumeStream();

    /*
     * The second drive sees a recorded context length for the first model
     * call that differs from the transcript it rebuilds, as if the recorded
     * transcript had diverged.
     */
    hooks.wrapContext = context => ({
      ...context,
      log: {
        ...context.log,
        getEffects: effectsOptions =>
          context.log.getEffects(effectsOptions).map(attempt =>
            attempt.start.data.key === 'model:0'
              ? {
                  ...attempt,
                  start: {
                    ...attempt.start,
                    data: {
                      ...attempt.start.data,
                      input: {
                        ...(attempt.start.data.input as object),
                        contextLength: 99,
                      },
                    },
                  },
                }
              : attempt,
          ),
      },
    });
    const reading = await agent.readStream({ session });
    await agent.drive({ session });

    const errors: unknown[] = [];
    for await (const part of reading.fullStream) {
      if (part.type === 'error') errors.push(part.error);
    }
    expect(errors).toMatchObject([
      { message: expect.stringContaining('replayed with a different context') },
    ]);
    expect(runtime.faux.state.callCount).toBe(1);
  });

  describe('cancel', () => {
    const cancelled = {
      unified: 'cancelled',
      raw: undefined,
    } as const;

    /**
     * Creates a session whose host tool `slow` cancels the running turn and
     * returns once the drive noticed the cancel.
     */
    async function setupCancellingTool() {
      const holder: { cancel?: () => Promise<void> } = {};
      const test = await setup({
        tools: {
          slow: tool({
            inputSchema: z.object({}),
            execute: async () => {
              await holder.cancel!();
              return 'done';
            },
          }),
        },
      });
      holder.cancel = async () => {
        await test.agent.cancel({ session: test.session });
        await vi.waitFor(() =>
          expect(hasPendingCancel({ log: test.log() })).toBe(true),
        );
      };
      return test;
    }

    test('finishes the turn as cancelled when a cancel arrives during a host tool call', async () => {
      const { agent, session, runtime, log } = await setupCancellingTool();
      runtime.faux.setResponses([
        fauxAssistantMessage([fauxToolCall('slow', {}, { id: 'call-1' })], {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage('never'),
      ]);

      const result = await agent.stream({ prompt: 'go', session });

      expect(await result.finishReason).toBe('other');
      expect(await result.rawFinishReason).toBe('cancelled');
      expect(runtime.faux.state.callCount).toBe(1);
      expect(log().getCurrentTurn()?.finish?.data.finishReason).toEqual(
        cancelled,
      );
      expect(log().getUndeliveredSubmissions()).toEqual([]);
    });

    test('runs the next prompt on the transcript the log recorded', async () => {
      const { agent, session, runtime } = await setupCancellingTool();
      let context: Message[] = [];
      runtime.faux.setResponses([
        fauxAssistantMessage([fauxToolCall('slow', {}, { id: 'call-1' })], {
          stopReason: 'toolUse',
        }),
        request => {
          context = request.messages;
          return fauxAssistantMessage('Next');
        },
      ]);
      await (await agent.stream({ prompt: 'go', session })).consumeStream();

      const result = await agent.generate({ prompt: 'again', session });

      expect(result.text).toBe('Next');
      expect(context.map(message => message.role)).toEqual([
        'system',
        'user',
        'assistant',
        'toolResult',
        'user',
      ]);
    });

    test('records a model call that a cancel cut off as interrupted', async () => {
      const { agent, session, runtime, log } = await setup();
      runtime.streamFn = (_model, _context, options) => {
        const out = createAssistantMessageEventStream();
        void (async () => {
          await agent.cancel({ session });
          const signal = options!.signal!;
          if (!signal.aborted) {
            await new Promise(resolve =>
              signal.addEventListener('abort', resolve, { once: true }),
            );
          }
          out.push({
            type: 'error',
            reason: 'aborted',
            error: fauxAssistantMessage('', {
              stopReason: 'aborted',
              errorMessage: 'aborted',
            }),
          });
        })();
        return out;
      };

      const result = await agent.stream({ prompt: 'go', session });

      expect(await result.rawFinishReason).toBe('cancelled');
      expect((await result.steps).map(step => step.rawFinishReason)).toEqual([
        'cancelled',
      ]);
      expect(log().getEffect({ key: 'model:0' })?.end?.data.output).toEqual({
        type: 'interrupted',
        retryable: true,
      });
    });

    test('finishes a turn whose cancel waits when the drive starts without running it', async () => {
      const { agent, session, runtime, hooks, log } = await setup();
      runtime.faux.setResponses([
        fauxAssistantMessage([fauxToolCall('ls', {}, { id: 'call-1' })], {
          stopReason: 'toolUse',
        }),
      ]);
      hooks.wrapContext = stopAfterFirstStep;
      await (await agent.stream({ prompt: 'list', session })).consumeStream();
      hooks.wrapContext = undefined;

      await agent.cancel({ session });
      const reading = await agent.readStream({ session });
      await agent.drive({ session });

      expect(await reading.rawFinishReason).toBe('cancelled');
      expect(runtime.faux.state.callCount).toBe(1);
      expect(log().getCurrentTurn()?.finish?.data.finishReason).toEqual(
        cancelled,
      );
    });
  });

  describe('tool approvals', () => {
    /**
     * Creates a session with the host tools `weather` and `time`, which both
     * require a user's approval, and a faux model that calls both in its
     * first response and answers with text in its second.
     */
    async function setupApprovals() {
      const weather = vi.fn(async () => 'sunny');
      const time = vi.fn(async () => 'noon');
      const test = await setup({
        tools: {
          weather: tool({ inputSchema: z.object({}), execute: weather }),
          time: tool({ inputSchema: z.object({}), execute: time }),
        },
        toolApproval: { weather: 'user-approval', time: 'user-approval' },
      });
      test.runtime.faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall('weather', {}, { id: 'call-1' }),
            fauxToolCall('time', {}, { id: 'call-2' }),
          ],
          { stopReason: 'toolUse' },
        ),
        fauxAssistantMessage('Done'),
      ]);
      return { ...test, weather, time };
    }

    /**
     * Returns the approval IDs of a result's approval requests, by tool name.
     */
    function getApprovalIds(
      content: ReadonlyArray<{
        type: string;
        approvalId?: string;
        toolCall?: { toolName: string };
      }>,
    ): Record<string, string> {
      const ids = Object.create(null) as Record<string, string>;
      for (const part of content) {
        if (
          part.type !== 'tool-approval-request' ||
          part.approvalId == null ||
          part.toolCall == null
        ) {
          continue;
        }
        ids[part.toolCall.toolName] = part.approvalId;
      }
      return ids;
    }

    test('requests approval for every call of a step and resumes the turn after the responses', async () => {
      const { agent, session, runtime, readState, weather, time } =
        await setupApprovals();

      const first = await agent.generate({ prompt: 'go', session });

      expect(first.finishReason).toBe('tool-calls');
      const ids = getApprovalIds(first.content);
      expect(Object.keys(ids)).toEqual(['weather', 'time']);
      expect(runtime.faux.state.callCount).toBe(1);
      expect(weather).not.toHaveBeenCalled();
      expect(time).not.toHaveBeenCalled();
      expect(readState().currentTurn?.ended).toBe(false);

      const second = await agent.stream({
        session,
        messages: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: ids.weather,
                approved: true,
              },
              {
                type: 'tool-approval-response',
                approvalId: ids.time,
                approved: false,
                reason: 'Not now',
              },
            ],
          },
        ],
      });

      expect(await second.text).toBe('Done');
      expect(await second.finishReason).toBe('stop');
      expect(weather).toHaveBeenCalledTimes(1);
      expect(time).not.toHaveBeenCalled();
      expect(runtime.faux.state.callCount).toBe(2);
      const state = readState();
      expect(state.currentTurn?.ended).toBe(true);
      expect(state.modelEffects[1].input.appended).toMatchObject([
        { role: 'toolResult', toolCallId: 'call-1', isError: false },
        {
          role: 'toolResult',
          toolCallId: 'call-2',
          isError: true,
          content: [
            { type: 'text', text: 'The tool call was denied: Not now' },
          ],
        },
      ]);
    });

    test('finishes a turn that waits for approval as cancelled', async () => {
      const { agent, session, runtime, log, weather } = await setupApprovals();
      await agent.generate({ prompt: 'go', session });

      await agent.cancel({ session });
      await agent.drive({ session });

      expect(log().getCurrentTurn()?.finish?.data.finishReason).toEqual({
        unified: 'cancelled',
        raw: undefined,
      });
      expect(runtime.faux.state.callCount).toBe(1);
      expect(weather).not.toHaveBeenCalled();
    });
  });

  test('merges several queued prompts into a single turn', async () => {
    const { agent, session, runtime, readState, log } = await setup();
    const firstModelStarted = new DelayedPromise<void>();
    const releaseFirstModel = new DelayedPromise<void>();
    runtime.faux.setResponses([
      async () => {
        firstModelStarted.resolve();
        await releaseFirstModel.promise;
        return fauxAssistantMessage('First answer');
      },
      context => {
        const userTexts = context.messages
          .filter(message => message.role === 'user')
          .map(message =>
            typeof message.content === 'string'
              ? message.content
              : message.content
                  .filter(part => part.type === 'text')
                  .map(part => part.text)
                  .join(''),
          );
        return fauxAssistantMessage(`Saw: ${userTexts.join(' | ')}`);
      },
    ]);

    const first = await agent.stream({ prompt: 'turn one', session });
    await firstModelStarted.promise;

    const second = await agent.stream({ prompt: 'queued A', session });
    const third = await agent.stream({ prompt: 'queued B', session });
    releaseFirstModel.resolve();

    expect((await first.steps).map(step => step.text)).toEqual([
      'First answer',
      'Saw: turn one | queued A\n\nqueued B',
    ]);
    expect(await second.text).toBe('Saw: turn one | queued A\n\nqueued B');
    expect(await third.text).toBe('Saw: turn one | queued A\n\nqueued B');

    const state = readState();
    expect(state.prompts).toHaveLength(3);
    expect(state.pendingPrompts).toEqual([]);
    expect(state.modelEffects).toMatchObject([
      { ordinal: 0, deliveredSubmissionIds: [state.prompts[0].id] },
      {
        ordinal: 1,
        deliveredSubmissionIds: [state.prompts[1].id, state.prompts[2].id],
      },
    ]);
    expect(log().getTurns()).toHaveLength(2);
    expect(
      log()
        .getTurns()[1]
        .submissions.map(submission => submission.id),
    ).toEqual([state.prompts[1].id, state.prompts[2].id]);
  });

  test('applies the latest prompt settings when merging pending prompts', async () => {
    const runtime = createTestModelRuntime();
    const sandbox = await createJustBashNetworkSandboxSession({
      sandboxId: 'sandbox-1',
    });
    let seenSystemPrompt: string | undefined;
    let seenToolNames: string[] = [];
    const resolveModelSpy = vi.spyOn(runtime, 'resolveModel');
    runtime.faux.setResponses([
      context => {
        const systemMessage = context.messages.find(
          message => message.role === 'system',
        );
        seenSystemPrompt =
          systemMessage != null && typeof systemMessage.content === 'string'
            ? systemMessage.content
            : undefined;
        const tools = context.messages.flatMap(message =>
          message.role === 'system' ? (message.toolsAdded ?? []) : [],
        );
        seenToolNames = tools.map(tool => tool.name);
        return fauxAssistantMessage('merged');
      },
    ]);

    const submissions = [
      {
        type: 'submission' as const,
        id: 'p1',
        data: {
          type: 'prompt' as const,
          message: { role: 'user' as const, content: 'first' },
          settings: {
            model: 'old-model',
            skills: [],
            tools: [
              {
                name: 'oldTool',
                description: 'old',
                inputSchema: { type: 'object' as const, properties: {} },
              },
            ],
            instructions: 'old instructions',
          },
        },
      },
      {
        type: 'submission' as const,
        id: 'p2',
        data: {
          type: 'prompt' as const,
          message: { role: 'user' as const, content: 'second' },
          settings: {
            model: 'latest-model',
            skills: [],
            tools: [
              {
                name: 'latestTool',
                description: 'latest',
                inputSchema: { type: 'object' as const, properties: {} },
              },
            ],
            instructions: 'latest instructions',
          },
        },
      },
    ];
    let delivered: string[] = [];
    const context: HarnessV2DriveContext = {
      log: {
        append: async () => true,
        onAppend: () => () => {},
        getSubmissions: () => submissions,
        getUndeliveredSubmissions: () =>
          submissions.filter(s => !delivered.includes(s.id)),
        getEffect: () => undefined,
        getEffects: () => [],
        getCurrentTurn: () => undefined,
        getTurns: () => [],
        getAdapterEvents: () => [],
      },
      effect: async options => {
        delivered = [...delivered, ...(options.deliveredSubmissionIds ?? [])];
        const result = options.fn({
          abortSignal: new AbortController().signal,
          startId: 'start-1',
          emit: () => {},
        });
        let value: unknown;
        if (Symbol.asyncIterator in result) {
          for await (const chunk of result) value = chunk;
        } else {
          value = await result;
        }
        return { type: 'result', value } as never;
      },
      finishStep: async () => {},
      finishTurn: async () => {},
      executeHostTool: async () => ({
        type: 'error',
        error: { message: 'unused' },
      }),
      executeBuiltinTool: async () => ({
        type: 'error',
        error: { message: 'unused' },
      }),
      executeMcpTool: async () => ({
        type: 'error',
        error: { message: 'unused' },
      }),
      gateBuiltinTool: async () => ({
        type: 'suspended',
        reason: 'approval',
      }),
      sandbox: async () => ({ session: sandbox, workDir: 'project' }),
      unsafeEmit: () => {},
      stopAbortSignal: new AbortController().signal,
      yieldAbortSignal: new AbortController().signal,
    };

    const drive = new PiDrive({
      sessionId: 'session-1',
      context,
      runtime,
    });
    await drive.run();

    expect(seenSystemPrompt).toBe('latest instructions');
    expect(seenToolNames).toContain('latestTool');
    expect(seenToolNames).not.toContain('oldTool');
    expect(resolveModelSpy).toHaveBeenLastCalledWith({
      modelId: 'latest-model',
    });
    expect(delivered).toEqual(['p1', 'p2']);
  });
});
