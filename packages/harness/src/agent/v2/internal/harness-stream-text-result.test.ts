import { NoOutputGeneratedError } from 'ai';
import { describe, expect, test } from 'vitest';
import { HarnessStreamTextResult } from './harness-stream-text-result';
import { HarnessAfterFinishError, HarnessBeforeStartError } from './errors';
import type { HarnessAgentStreamPart } from './create-stream-writer';

const finishReason = { unified: 'stop' as const, raw: 'stop' };

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const textParts: HarnessAgentStreamPart[] = [
  { type: 'text-start', id: 'text' },
  { type: 'text-delta', id: 'text', delta: 'Hello' },
  { type: 'text-delta', id: 'text', delta: ' world' },
  { type: 'text-end', id: 'text' },
];

const finishStepPart: HarnessAgentStreamPart = {
  type: 'finish-step',
  finishReason,
  usage,
};

function createResult(options: {
  parts: HarnessAgentStreamPart[];
  readError?: Error;
  aborted?: boolean;
}) {
  const abortController = new AbortController();
  if (options.aborted) abortController.abort();
  return new HarnessStreamTextResult({
    parts: new ReadableStream({
      start(controller) {
        for (const part of options.parts) controller.enqueue(part);
        if (options.readError == null) controller.close();
      },
      pull(controller) {
        if (options.readError != null) controller.error(options.readError);
      },
    }),
    abortSignal: abortController.signal,
    tools: {},
    harnessId: 'fake',
    callId: 'call',
  });
}

async function readPartTypes(
  stream: AsyncIterable<{ type: string }>,
): Promise<string[]> {
  const types: string[] = [];
  for await (const part of stream) types.push(part.type);
  return types;
}

describe('HarnessStreamTextResult', () => {
  test('streams a finished turn and settles its promises', async () => {
    const result = createResult({
      parts: [
        { type: 'start' },
        { type: 'stream-start', modelId: 'fake-model' },
        ...textParts,
        finishStepPart,
        { type: 'finish', finishReason, totalUsage: usage },
      ],
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(await result.text).toBe('Hello world');
    expect(await result.finishReason).toBe('stop');
    expect((await result.totalUsage).inputTokens).toBe(10);
    expect((await result.response).modelId).toBe('fake-model');
    expect(await result.turnEnd).toEqual({
      reason: 'finished',
      error: undefined,
    });
  });

  test('settles its promises without reading the stream', async () => {
    const result = createResult({
      parts: [
        { type: 'start' },
        ...textParts,
        finishStepPart,
        { type: 'yield' },
      ],
    });

    expect(await result.text).toBe('Hello world');
    expect(await result.finishReason).toBe('stop');
    expect(await result.steps).toHaveLength(1);
  });

  test('discards the content of a reset step', async () => {
    const result = createResult({
      parts: [
        { type: 'start' },
        { type: 'text-start', id: 'discarded' },
        { type: 'text-delta', id: 'discarded', delta: 'discarded' },
        { type: 'reset-step' },
        ...textParts,
        finishStepPart,
        { type: 'yield' },
      ],
    });

    expect(await result.text).toBe('Hello world');
  });

  test('ends a yielded turn without an extra part and drops later parts', async () => {
    const result = createResult({
      parts: [
        { type: 'start' },
        ...textParts,
        { type: 'yield' },
        { type: 'text-start', id: 'late' },
      ],
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
    ]);
    expect((await result.turnEnd).reason).toBe('yielded');
    await expect(result.text).rejects.toSatisfy(
      NoOutputGeneratedError.isInstance,
    );
  });

  test('adds an error part and reports the failure when reading fails', async () => {
    const result = createResult({
      parts: [{ type: 'start' }],
      readError: new Error('failed'),
    });

    expect(await readPartTypes(result.fullStream)).toEqual(['start', 'error']);
    const end = await result.turnEnd;
    expect(end.reason).toBe('failed');
    expect(end.error).toMatchObject({ message: 'Error: failed' });
  });

  test.each([
    ['before the turn started', HarnessBeforeStartError],
    ['after the turn finished', HarnessAfterFinishError],
  ])(
    'reports the original error of a drive that failed %s',
    async (_, ErrorClass) => {
      const cause = new Error('adapter failed');
      const result = createResult({
        parts: [],
        readError: new ErrorClass({ cause }),
      });

      const errors: unknown[] = [];
      for await (const part of result.fullStream) {
        if (part.type === 'error') errors.push(part.error);
      }
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(cause);
      const end = await result.turnEnd;
      expect(end.reason).toBe('failed');
      expect(end.error).toBe(cause);
    },
  );

  test('adds an abort part when the call was aborted', async () => {
    const result = createResult({
      parts: [{ type: 'start' }],
      aborted: true,
    });

    expect(await readPartTypes(result.fullStream)).toEqual(['start', 'abort']);
  });

  test('adds an error part when the parts ended without finishing the turn', async () => {
    const result = createResult({ parts: [{ type: 'start' }, ...textParts] });

    expect((await readPartTypes(result.fullStream)).at(-1)).toBe('error');
    expect((await result.turnEnd).reason).toBe('incomplete');
  });

  test('drops parts after the finish part', async () => {
    const result = createResult({
      parts: [
        { type: 'start' },
        ...textParts,
        finishStepPart,
        { type: 'finish', finishReason, totalUsage: usage },
        { type: 'text-start', id: 'late' },
      ],
    });

    expect((await readPartTypes(result.fullStream)).at(-1)).toBe('finish');
  });

  test('streams only text deltas through textStream', async () => {
    const result = createResult({
      parts: [{ type: 'start' }, ...textParts, finishStepPart],
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) chunks.push(chunk);

    expect(chunks).toEqual(['Hello', ' world']);
  });
});
