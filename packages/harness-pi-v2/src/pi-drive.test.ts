import type { HarnessV2LogEvent } from '@ai-sdk/harness';
import {
  fauxAssistantMessage,
  fauxToolCall,
  type Message,
} from '@earendil-works/pi-ai';
import { describe, expect, test } from 'vitest';
import { PiDrive } from './pi-drive';
import { readPiLogState } from './pi-log-state';
import {
  createTestDriveContext,
  createTestModelRuntime,
  type TestDriveContext,
} from './test-helpers';

async function drive(options: {
  test: TestDriveContext;
  runtime: ReturnType<typeof createTestModelRuntime>;
}) {
  await new PiDrive({
    sessionId: 'session-1',
    context: options.test.context,
    runtime: options.runtime,
  }).run();
}

function partTypes(test: TestDriveContext): string[] {
  return test.parts.map(({ part }) => part.type);
}

function modelStarts(test: TestDriveContext) {
  return test.events.filter(
    (event): event is Extract<HarnessV2LogEvent, { type: 'effect-start' }> =>
      event.type === 'effect-start' && event.data.name === 'model',
  );
}

describe('PiDrive', () => {
  test('runs a text-only turn', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime();
    runtime.faux.setResponses([fauxAssistantMessage('Hello there')]);
    const promptId = test.submitPrompt({ text: 'hi' });

    await drive({ test, runtime });

    expect(partTypes(test)).toEqual([
      'text-start',
      ...partTypes(test).filter(type => type === 'text-delta'),
      'text-end',
    ]);
    const text = test.parts
      .flatMap(({ part }) => (part.type === 'text-delta' ? [part.delta] : []))
      .join('');
    expect(text).toBe('Hello there');
    expect(test.steps).toMatchObject([
      { stepNumber: 0, finishReason: { unified: 'stop', raw: 'stop' } },
    ]);
    expect(test.turns).toMatchObject([
      { finishReason: { unified: 'stop', raw: 'stop' } },
    ]);
    const starts = modelStarts(test);
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      data: { key: 'model:0', deliveredSubmissionIds: [promptId] },
    });
    expect(readPiLogState({ events: test.events }).pendingPrompts).toEqual([]);
  });

  test('runs a built-in tool and a host tool across steps', async () => {
    const test = createTestDriveContext({
      hostTools: { weather: () => ({ forecast: 'sunny' }) },
    });
    const runtime = createTestModelRuntime();
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
    test.submitPrompt({
      text: 'write a file',
      tools: [
        {
          name: 'weather',
          description: 'Weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    });

    await drive({ test, runtime });

    const session = await test.getSandboxSession();
    expect(
      await session.readTextFile({
        path: `${session.defaultWorkingDirectory}/a.txt`,
      }),
    ).toBe('hello');
    expect(test.steps.map(step => step.stepNumber)).toEqual([0, 1, 2]);
    expect(test.steps.map(step => step.finishReason.unified)).toEqual([
      'tool-calls',
      'tool-calls',
      'stop',
    ]);
    expect(test.turns).toHaveLength(1);
    expect(
      test.parts
        .map(({ part }) => part)
        .filter(part => part.type === 'tool-call'),
    ).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'write',
        input: JSON.stringify({ path: 'a.txt', content: 'hello' }),
        providerExecuted: true,
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'weather',
        input: JSON.stringify({ city: 'Berlin' }),
      },
    ]);
    const state = readPiLogState({ events: test.events });
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
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime();
    runtime.faux.setResponses([
      fauxAssistantMessage([fauxToolCall('ls', {}, { id: 'call-1' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage('Done'),
    ]);
    test.submitPrompt({ text: 'list' });

    await drive({ test, runtime });

    const [first, second] = test.steps.map(step => step.usage);
    expect(first.inputTokens.total).toBeGreaterThan(0);
    expect(test.turns[0].totalUsage).toEqual({
      inputTokens: {
        total: first.inputTokens.total! + second.inputTokens.total!,
        noCache: first.inputTokens.noCache! + second.inputTokens.noCache!,
        cacheRead: first.inputTokens.cacheRead! + second.inputTokens.cacheRead!,
        cacheWrite:
          first.inputTokens.cacheWrite! + second.inputTokens.cacheWrite!,
      },
      outputTokens: {
        total: first.outputTokens.total! + second.outputTokens.total!,
        text: undefined,
        reasoning: undefined,
      },
    });
  });

  test('finishes the turn with an error after three failed model attempts', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime();
    const failure = fauxAssistantMessage('', {
      stopReason: 'error',
      errorMessage: 'provider unavailable',
    });
    runtime.faux.setResponses([failure, failure, failure]);
    test.submitPrompt({ text: 'hi' });

    await drive({ test, runtime });

    expect(
      partTypes(test).filter(type => type === 'reset-step' || type === 'error'),
    ).toEqual(['reset-step', 'reset-step', 'error']);
    expect(test.parts.at(-1)?.part).toEqual({
      type: 'error',
      error: { message: 'provider unavailable' },
    });
    expect(
      readPiLogState({ events: test.events }).modelEffects[0].output,
    ).toEqual({ type: 'error', error: { message: 'provider unavailable' } });
    expect(test.steps).toMatchObject([
      { stepNumber: 0, finishReason: { unified: 'error' } },
    ]);
    expect(test.turns).toMatchObject([{ finishReason: { unified: 'error' } }]);
  });

  test('resumes an unfinished turn without repeating recorded work', async () => {
    const first = createTestDriveContext();
    const firstRuntime = createTestModelRuntime();
    firstRuntime.faux.setResponses([
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
    const finishStep = first.context.finishStep;
    first.context.finishStep = async step => {
      await finishStep(step);
      first.yieldAbortController.abort();
    };
    first.submitPrompt({ text: 'run it' });

    await drive({ test: first, runtime: firstRuntime });

    expect(first.steps.map(step => step.stepNumber)).toEqual([0]);
    expect(first.turns).toEqual([]);
    expect(modelStarts(first)).toHaveLength(1);

    const second = first.nextDrive();
    const secondRuntime = createTestModelRuntime();
    let resumedContext: Message[] = [];
    secondRuntime.faux.setResponses([
      context => {
        resumedContext = context.messages;
        return fauxAssistantMessage('All done');
      },
    ]);

    await drive({ test: second, runtime: secondRuntime });

    expect(secondRuntime.faux.state.callCount).toBe(1);
    expect(second.steps.map(step => step.stepNumber)).toEqual([0, 1]);
    expect(second.turns).toMatchObject([{ finishReason: { unified: 'stop' } }]);
    expect(resumedContext.map(message => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'toolResult',
    ]);
    const session = await second.getSandboxSession();
    expect(
      await session.readTextFile({
        path: `${session.defaultWorkingDirectory}/runs.txt`,
      }),
    ).toBe('run\n');
    expect(modelStarts(second).map(event => event.data.key)).toEqual([
      'model:0',
      'model:1',
    ]);
  });

  test('halts without finishing the turn when the drive stops', async () => {
    const test = createTestDriveContext({
      hostTools: {
        slow: () => {
          test.stopAbortController.abort();
          return 'late';
        },
      },
    });
    const runtime = createTestModelRuntime();
    runtime.faux.setResponses([
      fauxAssistantMessage([fauxToolCall('slow', {}, { id: 'call-1' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage('never'),
    ]);
    test.submitPrompt({ text: 'go', tools: [{ name: 'slow' }] });

    await drive({ test, runtime });

    expect(runtime.faux.state.callCount).toBe(1);
    expect(test.steps).toEqual([]);
    expect(test.turns).toEqual([]);
    expect(
      readPiLogState({ events: test.events }).toolOutputs.get('call-1'),
    ).toEqual({ type: 'interrupted', retryable: false });
  });

  test('starts no new turn once the drive yields', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime();
    test.yieldAbortController.abort();
    test.submitPrompt({ text: 'hi' });

    await drive({ test, runtime });

    expect(runtime.faux.state.callCount).toBe(0);
    expect(test.events.map(event => event.type)).toEqual(['submission']);
  });

  test('runs a turn for each pending prompt, each seeing the earlier ones', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime();
    const contexts: Message[][] = [];
    runtime.faux.setResponses([
      context => {
        contexts.push(context.messages);
        return fauxAssistantMessage('first answer');
      },
      context => {
        contexts.push(context.messages);
        return fauxAssistantMessage('second answer');
      },
    ]);
    const firstId = test.submitPrompt({ text: 'first' });
    const secondId = test.submitPrompt({ text: 'second' });

    await drive({ test, runtime });

    expect(test.turns).toHaveLength(2);
    expect(test.steps.map(step => step.stepNumber)).toEqual([0, 0]);
    expect(
      modelStarts(test).map(event => event.data.deliveredSubmissionIds),
    ).toEqual([[firstId], [secondId]]);
    expect(contexts[1].map(message => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
  });

  test('continues a session in a later drive', async () => {
    const first = createTestDriveContext();
    const firstRuntime = createTestModelRuntime();
    firstRuntime.faux.setResponses([fauxAssistantMessage('first answer')]);
    first.submitPrompt({ text: 'first' });
    await drive({ test: first, runtime: firstRuntime });

    const second = first.nextDrive();
    second.submitPrompt({ text: 'second' });
    const secondRuntime = createTestModelRuntime();
    let context: Message[] = [];
    secondRuntime.faux.setResponses([
      request => {
        context = request.messages;
        return fauxAssistantMessage('second answer');
      },
    ]);
    await drive({ test: second, runtime: secondRuntime });

    expect(second.turns).toHaveLength(1);
    expect(second.steps.map(step => step.stepNumber)).toEqual([0]);
    expect(context).toMatchObject([
      { role: 'system' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: 'second' },
    ]);
    expect(
      readPiLogState({ events: second.events }).modelEffects[1].input.appended,
    ).toMatchObject([{ role: 'user', content: 'second' }]);
  });

  test('rethrows a rejected drive context call', async () => {
    const test = createTestDriveContext();
    const runtime = createTestModelRuntime();
    runtime.faux.setResponses([fauxAssistantMessage('Hello')]);
    const error = new Error('log unavailable');
    test.context.finishStep = async () => {
      throw error;
    };
    test.submitPrompt({ text: 'hi' });

    await expect(drive({ test, runtime })).rejects.toBe(error);
    expect(test.turns).toEqual([]);
  });

  test('fails the drive when a replayed model call diverges from the log', async () => {
    const first = createTestDriveContext();
    const firstRuntime = createTestModelRuntime();
    firstRuntime.faux.setResponses([
      fauxAssistantMessage([fauxToolCall('ls', {}, { id: 'call-1' })], {
        stopReason: 'toolUse',
      }),
    ]);
    const finishStep = first.context.finishStep;
    first.context.finishStep = async step => {
      await finishStep(step);
      first.yieldAbortController.abort();
    };
    first.submitPrompt({ text: 'list' });
    await drive({ test: first, runtime: firstRuntime });

    const start = modelStarts(first)[0];
    (start.data.input as { contextLength: number }).contextLength = 99;

    await expect(
      drive({ test: first.nextDrive(), runtime: createTestModelRuntime() }),
    ).rejects.toThrow('replayed with a different context');
  });
});
