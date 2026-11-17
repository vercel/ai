import type { HarnessV2, HarnessV2DriveContext } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import {
  fauxAssistantMessage,
  fauxToolCall,
  type Message,
} from '@earendil-works/pi-ai';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { PI_BUILTIN_TOOLS } from './pi-builtin-tools';
import { PiDrive, toPiUserMessage } from './pi-drive';
import { readPiLogState } from './pi-log-state';
import { createTestModelRuntime } from './test-helpers';

/**
 * Creates a session of a `HarnessAgent` whose drives run `PiDrive` with a
 * faux model. The agent, its log and its effects are real; `wrapContext`
 * lets a test change what the adapter sees of a drive's context, e.g. to
 * stop the drive midway, which the agent itself only does once a drive
 * ended.
 */
async function setup(options: { tools?: ToolSet } = {}) {
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
    sandboxConfig: { workDir: 'project' },
    getSandboxSession: async () => sandboxSession,
  });
  const session = await agent.createSession({ sandboxSession });
  return {
    agent,
    session,
    runtime,
    hooks,
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
});
