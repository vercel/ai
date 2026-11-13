import type { HarnessV2LogEvent, HarnessV2ToolSpec } from '@ai-sdk/harness';
import { describe, expect, test } from 'vitest';
import { FxDrive, toFxPromptInput } from './fx-drive';
import { readFxLogState } from './fx-log-state';
import {
  createTestDriveContext,
  createTestModelRuntime,
  readFixture,
  type TestDriveContext,
  type TestModelRuntime,
} from './test-helpers';

const BASH_TOOL: HarnessV2ToolSpec = {
  name: 'bash',
  description: 'Runs a shell command.',
  inputSchema: {
    type: 'object',
    properties: { command: { type: 'string' } },
    required: ['command'],
  },
};

async function drive(options: {
  test: TestDriveContext;
  runtime: TestModelRuntime;
}) {
  await new FxDrive({
    sessionId: 'session-1',
    context: options.test.context,
    runtime: options.runtime,
  }).run();
}

function effectStarts(options: { test: TestDriveContext; name?: string }) {
  return options.test.events.filter(
    (event): event is Extract<HarnessV2LogEvent, { type: 'effect-start' }> =>
      event.type === 'effect-start' &&
      (options.name == null || event.data.name === options.name),
  );
}

function effectKeys(test: TestDriveContext): string[] {
  return effectStarts({ test }).map(event => event.data.key);
}

function emittedText(test: TestDriveContext): string {
  return test.parts
    .flatMap(({ part }) => (part.type === 'text-delta' ? [part.delta] : []))
    .join('');
}

function toolOutput(options: { test: TestDriveContext; toolCallId: string }) {
  return readFxLogState({ events: options.test.events }).toolOutputs.get(
    options.toolCallId,
  );
}

/*
 * Runs a first drive whose host `bash` tool call yields the drive, so the
 * turn halts before its second model call: the log holds the turn's
 * delivery, its catalog and first model effect, and the tool effect.
 */
async function driveUntilYield() {
  let toolRuns = 0;
  const test = createTestDriveContext({
    hostTools: {
      bash: () => {
        toolRuns++;
        test.yieldAbortController.abort();
        return { stdout: 'LIBFX_FIXTURE' };
      },
    },
  });
  const runtime = createTestModelRuntime({
    responses: [await readFixture({ name: 'gateway-host-tool-call.sse.txt' })],
  });
  test.submitPrompt({ text: 'Run printf LIBFX_FIXTURE', tools: [BASH_TOOL] });

  await drive({ test, runtime });

  return { test, runtime, getToolRuns: () => toolRuns };
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
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    const promptId = test.submitPrompt({ text: 'Reply READY' });

    await drive({ test, runtime });

    expect(test.parts.map(({ part }) => part)).toMatchInlineSnapshot(`
      [
        {
          "id": "0",
          "type": "text-start",
        },
        {
          "delta": "READY",
          "id": "0",
          "type": "text-delta",
        },
        {
          "id": "0",
          "type": "text-end",
        },
      ]
    `);
    expect(test.steps).toMatchInlineSnapshot(`
      [
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "stepNumber": 0,
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 1714,
              "total": 1714,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": 5,
            },
            "raw": {
              "cache_creation": {
                "ephemeral_1h_input_tokens": 0,
                "ephemeral_5m_input_tokens": 0,
              },
              "cache_creation_input_tokens": 0,
              "cache_read_input_tokens": 0,
              "inference_geo": "not_available",
              "input_tokens": 1714,
              "output_tokens": 5,
              "service_tier": "standard",
            },
          },
        },
      ]
    `);
    expect(test.turns).toMatchInlineSnapshot(`
      [
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "totalUsage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 1714,
              "total": 1714,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": undefined,
              "total": 5,
            },
          },
        },
      ]
    `);
    expect(effectKeys(test)).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'checkpoint:0',
    ]);
    expect(effectStarts({ test, name: 'turn' })[0].data).toMatchObject({
      deliveredSubmissionIds: [promptId],
    });
    expect(effectStarts({ test, name: 'model' })[0].data.input).toMatchObject({
      model: 'spacexai/grok-4.7',
    });
    expect(runtime.requests).toHaveLength(1);
    expect(runtime.catalogRequests).toHaveLength(1);
    expect(readFxLogState({ events: test.events }).pendingPrompts).toEqual([]);
  });

  test('sends the turn model and instructions to AI Gateway', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    test.submitPrompt({
      text: 'Reply READY',
      model: 'anthropic/claude-haiku-4.5',
      instructions: 'Answer in capital letters.',
    });

    await drive({ test, runtime });

    expect(runtime.requests[0].headers.get('ai-language-model-id')).toBe(
      'anthropic/claude-haiku-4.5',
    );
    expect(runtime.requests[0].body).toContain('Answer in capital letters.');
  });

  test('runs a host tool across steps', async () => {
    const inputs: unknown[] = [];
    const test = createTestDriveContext({
      hostTools: {
        bash: input => {
          inputs.push(input);
          return { stdout: 'LIBFX_FIXTURE' };
        },
      },
    });
    const runtime = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-host-tool-call.sse.txt' }),
        await readFixture({ name: 'gateway-text.sse.txt' }),
      ],
    });
    test.submitPrompt({ text: 'Run printf LIBFX_FIXTURE', tools: [BASH_TOOL] });

    await drive({ test, runtime });

    expect(inputs).toEqual([{ command: 'printf LIBFX_FIXTURE' }]);
    expect(effectKeys(test)).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'tool:toolu_01KswTwrpijqi88ffraLQVsY',
      'model:0:1',
      'checkpoint:0',
    ]);
    expect(
      test.parts
        .map(({ part }) => part)
        .filter(part => part.type === 'tool-call'),
    ).toMatchInlineSnapshot(`
      [
        {
          "input": "{"command": "printf LIBFX_FIXTURE"}",
          "providerMetadata": {
            "anthropic": {
              "caller": {
                "type": "direct",
              },
            },
          },
          "toolCallId": "toolu_01KswTwrpijqi88ffraLQVsY",
          "toolName": "bash",
          "type": "tool-call",
        },
      ]
    `);
    expect(
      test.steps.map(({ stepNumber, finishReason }) => ({
        stepNumber,
        finishReason,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "finishReason": {
            "raw": "tool_use",
            "unified": "tool-calls",
          },
          "stepNumber": 0,
        },
        {
          "finishReason": {
            "raw": "end_turn",
            "unified": "stop",
          },
          "stepNumber": 1,
        },
      ]
    `);
    expect(test.turns.map(turn => turn.finishReason)).toEqual([
      { unified: 'stop', raw: 'end_turn' },
    ]);
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests[1].body).toContain('LIBFX_FIXTURE');
  });

  test('runs the built-in read_file tool on the sandbox', async () => {
    const test = createTestDriveContext();
    const session = await test.getSandboxSession();
    await session.writeTextFile({
      path: `${session.defaultWorkingDirectory}/notes.txt`,
      content: 'FIRST LINE\nsecond line\n',
    });
    const runtime = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-read-file-0.sse.txt' }),
        await readFixture({ name: 'gateway-read-file-1.sse.txt' }),
      ],
    });
    test.submitPrompt({ text: 'Read notes.txt' });

    await drive({ test, runtime });

    const toolStart = effectStarts({ test, name: 'tool.read_file' })[0];
    expect(toolStart.data).toMatchObject({
      key: 'tool:toolu_01BEfCB8M29YcjDxsHPQxXER',
      replay: 'safe',
      input: { path: 'notes.txt' },
    });
    expect(toolOutput({ test, toolCallId: 'toolu_01BEfCB8M29YcjDxsHPQxXER' }))
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
    expect(
      test.parts
        .map(({ part }) => part)
        .filter(part => part.type === 'tool-call'),
    ).toMatchObject([{ toolName: 'read_file', providerExecuted: true }]);
    expect(runtime.requests[1].body).toContain('FIRST LINE');
    expect(emittedText(test)).toContain('FIRST LINE');
  });

  test('runs the built-in shell tool on the sandbox', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-shell-0.sse.txt' }),
        await readFixture({ name: 'gateway-shell-1.sse.txt' }),
      ],
    });
    test.submitPrompt({ text: 'Append to runs.txt' });

    await drive({ test, runtime });

    const session = await test.getSandboxSession();
    expect(
      await session.readTextFile({
        path: `${session.defaultWorkingDirectory}/runs.txt`,
      }),
    ).toBe('run\n');
    expect(effectStarts({ test, name: 'tool.shell' })[0].data).toMatchObject({
      key: 'tool:toolu_011oy9fvwfHVh3aDtkRYxpPn',
      replay: 'never',
    });
    expect(emittedText(test)).toBe('DONE');
    expect(test.turns.map(turn => turn.finishReason)).toEqual([
      { unified: 'stop', raw: 'end_turn' },
    ]);
  });

  test('retries a failing model call three times, then ends the turn with an error', async () => {
    const test = createTestDriveContext();
    const failure = () => new Response('upstream failed', { status: 500 });
    const runtime = createTestModelRuntime({
      responses: [failure, failure, failure],
    });
    test.submitPrompt({ text: 'Reply READY' });

    await drive({ test, runtime });

    expect(runtime.requests).toHaveLength(3);
    expect(test.parts.map(({ part }) => part)).toMatchInlineSnapshot(`
      [
        {
          "error": {
            "message": "AI Gateway request failed with HTTP 500: upstream failed",
          },
          "type": "error",
        },
      ]
    `);
    expect(test.steps.map(step => step.finishReason)).toEqual([
      { unified: 'error', raw: undefined },
    ]);
    expect(test.turns.map(turn => turn.finishReason)).toEqual([
      { unified: 'error', raw: undefined },
    ]);
  });

  test('halts on a yield and resumes the turn in the next drive', async () => {
    const { test, runtime, getToolRuns } = await driveUntilYield();

    expect(test.turns).toEqual([]);
    expect(runtime.requests).toHaveLength(1);
    expect(effectKeys(test)).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'tool:toolu_01KswTwrpijqi88ffraLQVsY',
    ]);

    const next = test.nextDrive();
    const nextRuntime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    await drive({ test: next, runtime: nextRuntime });

    expect(getToolRuns()).toBe(1);
    expect(nextRuntime.requests).toHaveLength(1);
    expect(nextRuntime.catalogRequests).toHaveLength(0);
    expect(nextRuntime.requests[0].body).toContain('LIBFX_FIXTURE');
    expect(next.steps.map(step => step.stepNumber)).toEqual([0, 1]);
    expect(next.turns.map(turn => turn.finishReason)).toEqual([
      { unified: 'stop', raw: 'end_turn' },
    ]);
    expect(emittedText(next)).toBe('READY');
  });

  test('halts without finishing the turn when the drive stops during a model call', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [
        () => {
          test.stopAbortController.abort();
          throw new DOMException('The request was aborted.', 'AbortError');
        },
      ],
    });
    test.submitPrompt({ text: 'Reply READY' });

    await drive({ test, runtime });

    expect(runtime.requests).toHaveLength(1);
    expect(test.steps).toEqual([]);
    expect(test.turns).toEqual([]);
    expect(effectKeys(test)).toEqual(['turn:0', 'catalog:0:0', 'model:0:0']);
  });

  test('runs a turn for each pending prompt, continuing from the checkpoint', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-text.sse.txt' }),
        await readFixture({ name: 'gateway-text.sse.txt' }),
      ],
    });
    test.submitPrompt({ text: 'First prompt' });
    test.submitPrompt({ text: 'Second prompt' });

    await drive({ test, runtime });

    expect(test.turns).toHaveLength(2);
    expect(effectKeys(test)).toEqual([
      'turn:0',
      'catalog:0:0',
      'model:0:0',
      'checkpoint:0',
      'turn:1',
      'catalog:1:0',
      'model:1:0',
      'checkpoint:1',
    ]);
    expect(runtime.requests[1].body).toContain('First prompt');
    expect(runtime.requests[1].body).toContain('READY');
    expect(runtime.requests[1].body).toContain('Second prompt');
  });

  test('continues a later drive from the recorded checkpoint', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    test.submitPrompt({ text: 'First prompt' });
    await drive({ test, runtime });

    const next = test.nextDrive();
    const nextRuntime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    next.submitPrompt({ text: 'Second prompt' });
    await drive({ test: next, runtime: nextRuntime });

    expect(nextRuntime.requests).toHaveLength(1);
    expect(nextRuntime.requests[0].body).toContain('First prompt');
    expect(nextRuntime.requests[0].body).toContain('Second prompt');
    expect(next.turns).toHaveLength(1);
    expect(next.steps.map(step => step.stepNumber)).toEqual([0]);
  });

  test('rebuilds a turn the agent ended without a checkpoint from the log', async () => {
    const { test } = await driveUntilYield();
    test.events.push({
      type: 'finish-turn',
      id: 'agent-finish-turn',
      data: {
        turnId: 'turn',
        finishReason: { unified: 'error', raw: undefined },
        totalUsage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
    });

    const next = test.nextDrive();
    const nextRuntime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    next.submitPrompt({ text: 'Second prompt', tools: [BASH_TOOL] });
    await drive({ test: next, runtime: nextRuntime });

    expect(nextRuntime.requests).toHaveLength(1);
    expect(nextRuntime.requests[0].body).toContain('LIBFX_FIXTURE');
    expect(nextRuntime.requests[0].body).toContain('Second prompt');
    expect(next.turns).toHaveLength(1);
    expect(effectKeys(next).slice(4)).toEqual([
      'turn:1',
      'catalog:1:0',
      'model:1:0',
      'checkpoint:1',
    ]);
  });

  test('only finishes a turn whose checkpoint was recorded before the drive ended', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime({
      responses: [await readFixture({ name: 'gateway-text.sse.txt' })],
    });
    test.submitPrompt({ text: 'Reply READY' });
    await drive({ test, runtime });
    const finishIndex = test.events.findIndex(
      event => event.type === 'finish-turn',
    );
    test.events.splice(finishIndex, 1);

    const next = test.nextDrive();
    const nextRuntime = createTestModelRuntime();
    await drive({ test: next, runtime: nextRuntime });

    expect(nextRuntime.requests).toEqual([]);
    expect(next.parts).toEqual([]);
    expect(next.steps).toEqual([]);
    expect(next.turns).toEqual(test.turns);
  });

  test('fails the drive when a replayed model request differs from the recorded one', async () => {
    const { test } = await driveUntilYield();
    const modelStart = effectStarts({ test, name: 'model' })[0];
    test.events[test.events.indexOf(modelStart)] = {
      ...modelStart,
      data: {
        ...modelStart.data,
        input: { digest: 'tampered', model: 'spacexai/grok-4.7' },
      },
    };

    const next = test.nextDrive();
    const nextRuntime = createTestModelRuntime();

    await expect(drive({ test: next, runtime: nextRuntime })).rejects.toThrow(
      'replayed with a different request',
    );
    expect(nextRuntime.requests).toEqual([]);
    expect(next.turns).toEqual([]);
  });

  test('runs a host tool that overrides a built-in tool of the same name', async () => {
    const test = createTestDriveContext({
      hostTools: { read_file: () => ({ text: 'FIRST LINE from the host' }) },
    });
    const runtime = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-read-file-0.sse.txt' }),
        await readFixture({ name: 'gateway-read-file-1.sse.txt' }),
      ],
    });
    test.submitPrompt({
      text: 'Read notes.txt',
      tools: [
        {
          name: 'read_file',
          description: 'Reads a file from the host.',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
          },
        },
      ],
    });

    await drive({ test, runtime });

    const toolStart = effectStarts({ test, name: 'tool.read_file' })[0];
    expect(toolStart.data.replay).toBe('never');
    const requestTools = (
      JSON.parse(runtime.requests[0].body) as {
        tools: Array<{ name: string; description: string }>;
      }
    ).tools.filter(tool => tool.name === 'read_file');
    expect(requestTools).toMatchObject([
      { description: 'Reads a file from the host.' },
    ]);
    expect(
      test.parts
        .map(({ part }) => part)
        .find(part => part.type === 'tool-call'),
    ).not.toHaveProperty('providerExecuted');
    expect(runtime.requests[1].body).toContain('FIRST LINE from the host');
  });

  test('rethrows a rejected finishStep() call', async () => {
    const test = createTestDriveContext({
      hostTools: { bash: () => ({ stdout: 'LIBFX_FIXTURE' }) },
    });
    test.context.finishStep = async () => {
      throw new Error('finishStep failed');
    };
    const runtime = createTestModelRuntime({
      responses: [
        await readFixture({ name: 'gateway-host-tool-call.sse.txt' }),
      ],
    });
    test.submitPrompt({ text: 'Run printf LIBFX_FIXTURE', tools: [BASH_TOOL] });

    await expect(drive({ test, runtime })).rejects.toThrow('finishStep failed');
    expect(runtime.requests).toHaveLength(1);
    expect(test.turns).toEqual([]);
  });
});
