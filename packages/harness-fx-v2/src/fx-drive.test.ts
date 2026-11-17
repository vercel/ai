import type { HarnessV2, HarnessV2DriveContext } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool, type ToolSet } from '@ai-sdk/provider-utils';
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { describe, expect, test } from 'vitest';
import { z } from 'zod/v4';
import { FX_BUILTIN_TOOLS } from './fx-builtin-tools';
import { FxDrive, toFxPromptInput } from './fx-drive';
import { readFxLogState } from './fx-log-state';
import {
  createTestModelRuntime,
  readFixture,
  type TestModelResponse,
} from './test-helpers';

/**
 * Creates a session of a `HarnessAgent` whose drives run `FxDrive` with
 * scripted model responses. The agent, its log and its effects are real;
 * `wrapContext` lets a test change what the adapter sees of a drive's
 * context, e.g. to stop the drive midway, which the agent itself only does
 * once a drive ended.
 */
async function setup(
  options: { tools?: ToolSet; responses?: TestModelResponse[] } = {},
) {
  const runtime = createTestModelRuntime({ responses: options.responses });
  const contexts: HarnessV2DriveContext[] = [];
  const hooks: {
    wrapContext?: (context: HarnessV2DriveContext) => HarnessV2DriveContext;
  } = {};
  const harness: HarnessV2<typeof FX_BUILTIN_TOOLS> = {
    specificationVersion: 'harness-v2',
    harnessId: 'fx',
    builtinTools: FX_BUILTIN_TOOLS,
    async drive({ sessionId, context }) {
      const driveContext = hooks.wrapContext?.(context) ?? context;
      contexts.push(driveContext);
      await new FxDrive({ sessionId, context: driveContext, runtime }).run();
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
  const projectPath = (path: string) =>
    `${sandboxSession.defaultWorkingDirectory}/project/${path}`;
  const log = () => contexts.at(-1)!.log;
  return {
    agent,
    session,
    runtime,
    hooks,
    readState: () => readFxLogState({ log: log() }),
    effectKeys: () =>
      log()
        .getEffects()
        .map(attempt => attempt.start.data.key),
    getEffectStart: (key: string) => log().getEffect({ key })?.start.data,
    readFile: (path: string) =>
      sandboxSession.readTextFile({ path: projectPath(path) }),
    writeFile: (options: { path: string; content: string }) =>
      sandboxSession.writeTextFile({
        path: projectPath(options.path),
        content: options.content,
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
 * Returns the messages of the `error` parts of a stream.
 */
async function readErrors(result: {
  fullStream: AsyncIterable<{ type: string; error?: unknown }>;
}): Promise<unknown[]> {
  const errors: unknown[] = [];
  for await (const part of result.fullStream) {
    if (part.type === 'error') errors.push(part.error);
  }
  return errors;
}

/**
 * Returns a host `bash` tool that runs `execute`.
 */
function bashTool(execute: () => unknown) {
  return tool({
    description: 'Runs a shell command.',
    inputSchema: z.object({ command: z.string() }),
    execute: async () => execute(),
  });
}

/**
 * Runs a first drive whose host `bash` tool call stops the drive, so the
 * turn halts before its second model call: the log holds the turn's
 * delivery, its catalog and first model effect, and the tool effect.
 */
async function setupStoppedAfterHostTool() {
  const stop = new AbortController();
  let toolRuns = 0;
  const test = await setup({
    tools: {
      bash: bashTool(() => {
        toolRuns++;
        stop.abort();
        return { stdout: 'LIBFX_FIXTURE' };
      }),
    },
    responses: [await readFixture({ name: 'gateway-host-tool-call.sse.txt' })],
  });
  test.hooks.wrapContext = context =>
    withStop({ context, stopAbortSignal: stop.signal });
  await (
    await test.agent.stream({
      prompt: 'Run printf LIBFX_FIXTURE',
      session: test.session,
    })
  ).consumeStream();
  test.hooks.wrapContext = undefined;
  return { ...test, getToolRuns: () => toolRuns };
}

describe('toFxPromptInput', () => {
  test('keeps a text-only message as a string', () => {
    expect(
      toFxPromptInput({ message: { role: 'user', content: 'Hello' } }),
    ).toBe('Hello');
  });

  test('converts text and inline image parts to libfx blocks', () => {
    expect(
      toFxPromptInput({
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
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "text": "What's in the picture?",
          "type": "text",
        },
        {
          "data": "iVBORw==",
          "mimeType": "image/png",
          "type": "image",
        },
      ]
    `);
  });

  test('rejects a remote image URL', () => {
    expect(() =>
      toFxPromptInput({
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
      }),
    ).toThrow('remote image URLs');
  });
});

describe('FxDrive', () => {
  test('runs a text-only turn', async () => {
    const { agent, session, runtime, readState, effectKeys, getEffectStart } =
      await setup({
        responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
      });

    const result = await agent.generate({ prompt: 'Reply READY', session });

    expect(result.text).toBe('READY');
    expect(result.steps.map(step => step.finishReason)).toEqual(['stop']);
    expect(result.usage).toMatchObject({ inputTokens: 1714, outputTokens: 5 });
    expect(effectKeys()).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'checkpoint:0',
    ]);
    const state = readState();
    expect(getEffectStart('turn:0')).toMatchObject({
      deliveredSubmissionIds: [state.prompts[0].id],
    });
    expect(getEffectStart('model:0:0')?.input).toMatchObject({
      model: 'spacexai/grok-4.7',
    });
    expect(runtime.requests).toHaveLength(1);
    expect(runtime.catalogRequests).toHaveLength(1);
    expect(state.pendingPrompts).toEqual([]);
    expect(state.turns).toMatchObject([{ index: 0, ended: true }]);
  });

  test('sends the turn model and instructions to AI Gateway', async () => {
    const { agent, session, runtime, hooks } = await setup({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    /*
     * `HarnessAgent` submits prompts without a model or instructions, so the
     * drive sees its prompt with both added to the turn settings.
     */
    hooks.wrapContext = context => ({
      ...context,
      log: {
        ...context.log,
        getUndeliveredSubmissions: () =>
          context.log.getUndeliveredSubmissions().map(submission =>
            submission.data.type === 'prompt'
              ? {
                  ...submission,
                  data: {
                    ...submission.data,
                    settings: {
                      ...submission.data.settings,
                      model: 'anthropic/claude-haiku-4.5',
                      instructions: 'Answer in capital letters.',
                    },
                  },
                }
              : submission,
          ),
      },
    });

    await agent.generate({ prompt: 'Reply READY', session });

    expect(runtime.requests[0].headers.get('ai-language-model-id')).toBe(
      'anthropic/claude-haiku-4.5',
    );
    expect(runtime.requests[0].body).toContain('Answer in capital letters.');
  });

  test('runs a host tool across steps', async () => {
    const { agent, session, runtime, effectKeys } = await setup({
      tools: { bash: bashTool(() => ({ stdout: 'LIBFX_FIXTURE' })) },
      responses: [
        await readFixture({ name: 'gateway-host-tool-call.sse.txt' }),
        await readFixture({ name: 'gateway-text.sse.txt' }),
      ],
    });

    const result = await agent.generate({
      prompt: 'Run printf LIBFX_FIXTURE',
      session,
    });

    expect(effectKeys()).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'tool:toolu_01KswTwrpijqi88ffraLQVsY',
      'model:0:1',
      'checkpoint:0',
    ]);
    expect(result.steps.flatMap(step => step.toolCalls)).toMatchObject([
      {
        toolCallId: 'toolu_01KswTwrpijqi88ffraLQVsY',
        toolName: 'bash',
        input: { command: 'printf LIBFX_FIXTURE' },
      },
    ]);
    expect(result.steps.map(step => step.finishReason)).toEqual([
      'tool-calls',
      'stop',
    ]);
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests[1].body).toContain('LIBFX_FIXTURE');
  });

  test('runs the built-in read_file tool on the sandbox', async () => {
    const { agent, session, runtime, readState, getEffectStart, writeFile } =
      await setup({
        responses: [
          await readFixture({ name: 'gateway-read-file-0.sse.txt' }),
          await readFixture({ name: 'gateway-read-file-1.sse.txt' }),
        ],
      });
    await writeFile({
      path: 'notes.txt',
      content: 'FIRST LINE\nsecond line\n',
    });

    const result = await agent.generate({ prompt: 'Read notes.txt', session });

    expect(getEffectStart('tool:toolu_01BEfCB8M29YcjDxsHPQxXER')).toMatchObject(
      { name: 'tool.read_file', replay: 'safe', input: { path: 'notes.txt' } },
    );
    expect(readState().toolOutputs.get('toolu_01BEfCB8M29YcjDxsHPQxXER'))
      .toMatchInlineSnapshot(`
      {
        "type": "result",
        "value": {
          "raw": {
            "text": "<path>notes.txt</path>
      <content>
      1	FIRST LINE
      2	second line
      </content>",
          },
        },
      }
    `);
    expect(result.toolCalls).toMatchObject([
      { toolName: 'read_file', providerExecuted: true },
    ]);
    expect(runtime.requests[1].body).toContain('FIRST LINE');
    expect(result.text).toContain('FIRST LINE');
  });

  test('runs the built-in shell tool on the sandbox', async () => {
    const { agent, session, getEffectStart, readFile } = await setup({
      responses: [
        await readFixture({ name: 'gateway-shell-0.sse.txt' }),
        await readFixture({ name: 'gateway-shell-1.sse.txt' }),
      ],
    });

    const result = await agent.generate({
      prompt: 'Append to runs.txt',
      session,
    });

    expect(await readFile('runs.txt')).toBe('run\n');
    expect(getEffectStart('tool:toolu_011oy9fvwfHVh3aDtkRYxpPn')).toMatchObject(
      { name: 'tool.shell', replay: 'never' },
    );
    expect(result.text).toBe('DONE');
    expect(result.finishReason).toBe('stop');
  });

  test('retries a failing model call three times, then ends the turn with an error', async () => {
    const failure = () => new Response('upstream failed', { status: 500 });
    const { agent, session, runtime } = await setup({
      responses: [failure, failure, failure],
    });

    const result = await agent.stream({ prompt: 'Reply READY', session });

    expect(await readErrors(result)).toMatchObject([
      {
        message: 'AI Gateway request failed with HTTP 500: upstream failed',
      },
    ]);
    expect(runtime.requests).toHaveLength(3);
    expect((await result.steps).map(step => step.finishReason)).toEqual([
      'error',
    ]);
    expect(await result.finishReason).toBe('error');
  });

  test('halts when the drive stops and resumes the turn in the next drive', async () => {
    const { agent, session, runtime, readState, effectKeys, getToolRuns } =
      await setupStoppedAfterHostTool();

    expect(readState().turns).toMatchObject([{ ended: false }]);
    expect(runtime.requests).toHaveLength(1);
    expect(effectKeys()).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'tool:toolu_01KswTwrpijqi88ffraLQVsY',
    ]);

    runtime.push(await readFixture({ name: 'gateway-text.sse.txt' }));
    const reading = await agent.readStream({ session });
    await agent.drive({ session });

    expect(getToolRuns()).toBe(1);
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.catalogRequests).toHaveLength(1);
    expect(runtime.requests[1].body).toContain('LIBFX_FIXTURE');
    expect((await reading.steps).map(step => step.finishReason)).toEqual([
      'tool-calls',
      'stop',
    ]);
    expect(await reading.finishReason).toBe('stop');
    expect(await reading.text).toBe('READY');
  });

  test('halts without finishing the turn when the drive stops during a model call', async () => {
    const stop = new AbortController();
    const { agent, session, runtime, hooks, readState, effectKeys } =
      await setup({
        responses: [
          () => {
            stop.abort();
            throw new DOMException('The request was aborted.', 'AbortError');
          },
        ],
      });
    hooks.wrapContext = context =>
      withStop({ context, stopAbortSignal: stop.signal });

    const result = await agent.stream({ prompt: 'Reply READY', session });
    await result.consumeStream();

    expect(runtime.requests).toHaveLength(1);
    expect(readState().turns).toMatchObject([{ ended: false }]);
    expect(effectKeys()).toEqual(['turn:0', 'catalog:0:0', 'model:0:0']);
  });

  test('continues a later drive from the recorded checkpoint', async () => {
    const { agent, session, runtime } = await setup({
      responses: [
        await readFixture({ name: 'gateway-text.sse.txt' }),
        await readFixture({ name: 'gateway-text.sse.txt' }),
      ],
    });

    await agent.generate({ prompt: 'First prompt', session });
    const result = await agent.generate({ prompt: 'Second prompt', session });

    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests[1].body).toContain('First prompt');
    expect(runtime.requests[1].body).toContain('READY');
    expect(runtime.requests[1].body).toContain('Second prompt');
    expect(result.steps).toHaveLength(1);
  });

  test('rebuilds a turn the agent ended without a checkpoint from the log', async () => {
    const { agent, session, runtime, hooks, effectKeys } =
      await setupStoppedAfterHostTool();
    hooks.wrapContext = () => {
      throw new Error('drive failed');
    };
    await agent.drive({ session });
    hooks.wrapContext = undefined;

    runtime.push(await readFixture({ name: 'gateway-text.sse.txt' }));
    const result = await agent.generate({ prompt: 'Second prompt', session });

    expect(result.text).toBe('READY');
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests[1].body).toContain('LIBFX_FIXTURE');
    expect(runtime.requests[1].body).toContain('Second prompt');
    expect(effectKeys().slice(4)).toEqual([
      'turn:1',
      'catalog:1:0',
      'model:1:0',
      'checkpoint:1',
    ]);
  });

  test('only finishes a turn whose checkpoint was recorded before the drive ended', async () => {
    const { agent, session, runtime, hooks, readState } = await setup({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    /*
     * The first drive ends after recording the turn's checkpoint, before
     * finishing the turn, as if its process had crashed there.
     */
    hooks.wrapContext = context => ({ ...context, finishTurn: async () => {} });
    await (
      await agent.stream({ prompt: 'Reply READY', session })
    ).consumeStream();
    hooks.wrapContext = undefined;

    expect(readState().turns).toMatchObject([
      { ended: false, checkpoint: { finishReason: { unified: 'stop' } } },
    ]);

    const reading = await agent.readStream({ session });
    await agent.drive({ session });

    expect(runtime.requests).toHaveLength(1);
    expect(await reading.text).toBe('READY');
    expect(await reading.finishReason).toBe('stop');
    expect(readState().turns).toMatchObject([{ ended: true }]);
  });

  test('fails the drive when a replayed model request differs from the recorded one', async () => {
    const { agent, session, runtime, hooks } =
      await setupStoppedAfterHostTool();
    /*
     * The second drive sees a recorded digest for the first model request
     * that differs from the request it rebuilds, as if the recorded
     * conversation had diverged.
     */
    hooks.wrapContext = context => ({
      ...context,
      log: {
        ...context.log,
        getEffects: effectsOptions =>
          context.log.getEffects(effectsOptions).map(attempt =>
            attempt.start.data.key === 'model:0:0'
              ? {
                  ...attempt,
                  start: {
                    ...attempt.start,
                    data: {
                      ...attempt.start.data,
                      input: { digest: 'tampered', model: 'spacexai/grok-4.7' },
                    },
                  },
                }
              : attempt,
          ),
      },
    });
    const reading = await agent.readStream({ session });
    await agent.drive({ session });

    expect(await readErrors(reading)).toMatchObject([
      { message: expect.stringContaining('replayed with a different request') },
    ]);
    expect(runtime.requests).toHaveLength(1);
  });

  test('runs a host tool that overrides a built-in tool of the same name', async () => {
    const { agent, session, runtime, getEffectStart } = await setup({
      tools: {
        read_file: tool({
          description: 'Reads a file from the host.',
          inputSchema: z.object({ path: z.string() }),
          execute: async () => ({ text: 'FIRST LINE from the host' }),
        }),
      },
      responses: [
        await readFixture({ name: 'gateway-read-file-0.sse.txt' }),
        await readFixture({ name: 'gateway-read-file-1.sse.txt' }),
      ],
    });

    const result = await agent.generate({ prompt: 'Read notes.txt', session });

    expect(getEffectStart('tool:toolu_01BEfCB8M29YcjDxsHPQxXER')?.replay).toBe(
      'never',
    );
    const requestTools = (
      JSON.parse(runtime.requests[0].body) as {
        tools: Array<{ name: string; description: string }>;
      }
    ).tools.filter(tool => tool.name === 'read_file');
    expect(requestTools).toMatchObject([
      { description: 'Reads a file from the host.' },
    ]);
    expect(result.toolCalls[0].providerExecuted).toBeFalsy();
    expect(runtime.requests[1].body).toContain('FIRST LINE from the host');
  });

  test('rethrows a rejected finishStep() call', async () => {
    const { agent, session, runtime, hooks, readState } = await setup({
      tools: { bash: bashTool(() => ({ stdout: 'LIBFX_FIXTURE' })) },
      responses: [
        await readFixture({ name: 'gateway-host-tool-call.sse.txt' }),
      ],
    });
    hooks.wrapContext = context => ({
      ...context,
      finishStep: async () => {
        throw new Error('finishStep failed');
      },
    });

    await expect(
      agent.generate({ prompt: 'Run printf LIBFX_FIXTURE', session }),
    ).rejects.toThrow('finishStep failed');
    expect(runtime.requests).toHaveLength(1);
    expect(readState().turns.map(turn => turn.checkpoint)).toEqual([undefined]);
  });
});
