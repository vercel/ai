import { NoOutputGeneratedError } from 'ai';
import { describe, expect, test } from 'vitest';
import { HarnessStreamTextResult } from './harness-stream-text-result';
import { HarnessAfterFinishError, HarnessBeforeStartError } from './errors';
import type {
  HarnessAgentStreamPart,
  HarnessAgentStreamPartRecord,
} from './create-stream-writer';

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
  parts?: HarnessAgentStreamPart[];
  records?: HarnessAgentStreamPartRecord[];
  readError?: Error;
  aborted?: boolean;
  excludeInitialTurnPrompts?: boolean;
}) {
  const abortController = new AbortController();
  if (options.aborted) abortController.abort();
  const records =
    options.records ?? (options.parts ?? []).map(part => ({ part }));
  return new HarnessStreamTextResult({
    records: new ReadableStream<HarnessAgentStreamPartRecord>({
      start(controller) {
        for (const record of records) controller.enqueue(record);
        if (options.readError == null) controller.close();
      },
      pull(controller) {
        if (options.readError != null) controller.error(options.readError);
      },
    }),
    abortSignal: abortController.signal,
    excludeInitialTurnPrompts: options.excludeInitialTurnPrompts,
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
  test('passes approval parts through without re-emitting earlier tool calls', async () => {
    const result = createResult({
      parts: [
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: { city: 'Paris' },
            dynamic: true,
          },
          isAutomatic: true,
        },
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: { city: 'Paris' },
            dynamic: true,
          },
          approved: false,
          reason: 'Not allowed',
        },
        {
          type: 'tool-output-denied',
          toolCallId: 'call-1',
          toolName: 'weather',
        },
        finishStepPart,
        { type: 'settle' },
      ],
    });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    expect(parts.some(part => part.type === 'tool-call')).toBe(false);
    expect(
      parts.filter(
        part =>
          part.type === 'tool-approval-request' ||
          part.type === 'tool-approval-response',
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "approvalId": "approval-1",
          "isAutomatic": true,
          "toolCall": {
            "dynamic": true,
            "input": {
              "city": "Paris",
            },
            "toolCallId": "call-1",
            "toolName": "weather",
            "type": "tool-call",
          },
          "type": "tool-approval-request",
        },
        {
          "approvalId": "approval-1",
          "approved": false,
          "reason": "Not allowed",
          "toolCall": {
            "dynamic": true,
            "input": {
              "city": "Paris",
            },
            "toolCallId": "call-1",
            "toolName": "weather",
            "type": "tool-call",
          },
          "type": "tool-approval-response",
        },
      ]
    `);
  });

  test('streams a finished turn and settles its promises', async () => {
    const result = createResult({
      parts: [
        { type: 'start-turn' },
        { type: 'stream-start', modelId: 'fake-model' },
        ...textParts,
        finishStepPart,
        { type: 'finish-turn', finishReason, totalUsage: usage },
        { type: 'settle' },
      ],
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'custom',
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
      'custom',
      'finish',
    ]);
    expect(await result.text).toBe('Hello world');
    expect(await result.finishReason).toBe('stop');
    expect((await result.totalUsage).inputTokens).toBe(10);
    expect((await result.response).modelId).toBe('fake-model');
    expect(await result.end).toEqual({
      reason: 'finished',
      error: undefined,
    });
  });

  test('settles its promises without reading the stream', async () => {
    const result = createResult({
      parts: [
        { type: 'start-turn' },
        ...textParts,
        finishStepPart,
        { type: 'yield' },
      ],
    });

    expect(await result.text).toBe('Hello world');
    expect(await result.finishReason).toBe('stop');
    expect(await result.steps).toHaveLength(1);
  });

  test('finishes a response that waits for tool approval at its settle part', async () => {
    const toolCallsReason = { unified: 'tool-calls' as const, raw: 'tool_use' };
    const result = createResult({
      parts: [
        { type: 'start-turn' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Berlin"}',
        },
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: { city: 'Berlin' },
            dynamic: true,
          },
        },
        { type: 'finish-step', finishReason: toolCallsReason, usage },
        { type: 'settle' },
        { type: 'text-start', id: 'late' },
      ],
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'custom',
      'start-step',
      'tool-call',
      'tool-approval-request',
      'finish-step',
      'finish',
    ]);
    expect(await result.finishReason).toBe('tool-calls');
    expect((await result.totalUsage).inputTokens).toBe(10);
    expect((await result.content).map(part => part.type)).toEqual([
      'tool-call',
      'tool-approval-request',
    ]);
    expect((await result.end).reason).toBe('finished');
  });

  test('continues a turn after tool approval responses and sums the usage of its own steps', async () => {
    const result = createResult({
      parts: [
        {
          type: 'tool-output-denied',
          toolCallId: 'call-1',
          toolName: 'weather',
        },
        ...textParts,
        finishStepPart,
        { type: 'finish-turn', finishReason, totalUsage: { ...usage } },
        { type: 'settle' },
      ],
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'start-step',
      'tool-output-denied',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
      'custom',
      'finish',
    ]);
    expect(await result.finishReason).toBe('stop');
    expect((await result.totalUsage).inputTokens).toBe(10);
    expect(await result.text).toBe('Hello world');
  });

  test('reports a cancelled turn as finish reason other with the raw reason cancelled', async () => {
    const cancelled = { unified: 'cancelled' as const, raw: undefined };
    const result = createResult({
      parts: [
        { type: 'start-turn' },
        ...textParts,
        { type: 'finish-step', finishReason: cancelled, usage },
        { type: 'finish-turn', finishReason: cancelled, totalUsage: usage },
        { type: 'settle' },
      ],
    });

    expect(await result.finishReason).toBe('other');
    expect(await result.rawFinishReason).toBe('cancelled');
    const [step] = await result.steps;
    expect(step.finishReason).toBe('other');
    expect(step.rawFinishReason).toBe('cancelled');
    expect(await result.end).toEqual({
      reason: 'finished',
      error: undefined,
    });
  });

  test('discards the content of a reset step', async () => {
    const result = createResult({
      parts: [
        { type: 'start-turn' },
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
        { type: 'start-turn' },
        ...textParts,
        { type: 'yield' },
        { type: 'text-start', id: 'late' },
      ],
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'custom',
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
    ]);
    expect((await result.end).reason).toBe('yielded');
    await expect(result.text).rejects.toSatisfy(
      NoOutputGeneratedError.isInstance,
    );
  });

  test('adds an error part and reports the failure when reading fails', async () => {
    const result = createResult({
      parts: [{ type: 'start-turn' }],
      readError: new Error('failed'),
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'custom',
      'error',
    ]);
    const end = await result.end;
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
      const end = await result.end;
      expect(end.reason).toBe('failed');
      expect(end.error).toBe(cause);
    },
  );

  test('adds an abort part when the call was aborted', async () => {
    const result = createResult({
      parts: [{ type: 'start-turn' }],
      aborted: true,
    });

    expect(await readPartTypes(result.fullStream)).toEqual([
      'start',
      'custom',
      'abort',
    ]);
  });

  test('adds an error part when the parts ended without finishing the turn', async () => {
    const result = createResult({
      parts: [{ type: 'start-turn' }, ...textParts],
    });

    expect((await readPartTypes(result.fullStream)).at(-1)).toBe('error');
    expect((await result.end).reason).toBe('incomplete');
  });

  test('drops parts after the finish part', async () => {
    const result = createResult({
      parts: [
        { type: 'start-turn' },
        ...textParts,
        finishStepPart,
        { type: 'finish-turn', finishReason, totalUsage: usage },
        { type: 'settle' },
        { type: 'text-start', id: 'late' },
      ],
    });

    expect((await readPartTypes(result.fullStream)).at(-1)).toBe('finish');
  });

  test('streams only text deltas through textStream', async () => {
    const result = createResult({
      parts: [{ type: 'start-turn' }, ...textParts, finishStepPart],
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) chunks.push(chunk);

    expect(chunks).toEqual(['Hello', ' world']);
  });

  test.each(['toUIMessageStream', 'toUIMessageStreamResponse'] as const)(
    'redacts a tool error in %s when redactToolErrors is true',
    async method => {
      const result = createResult({
        parts: [
          { type: 'start-turn' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: '{}',
          },
          {
            type: 'tool-error',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: {},
            error: 'weather backend timeout',
            dynamic: true,
          },
          finishStepPart,
          { type: 'finish-turn', finishReason, totalUsage: usage },
          { type: 'settle' },
        ],
      });

      let body: string;
      if (method === 'toUIMessageStreamResponse') {
        body = await result
          .toUIMessageStreamResponse({ redactToolErrors: true })
          .text();
      } else {
        const chunks: unknown[] = [];
        for await (const chunk of result.toUIMessageStream({
          redactToolErrors: true,
        })) {
          chunks.push(chunk);
        }
        body = JSON.stringify(chunks);
      }

      expect(body).toContain('"errorText":"An error occurred."');
      expect(body).not.toContain('weather backend timeout');
    },
  );

  describe('retractions', () => {
    const keptRecords: HarnessAgentStreamPartRecord[] = [
      { part: { type: 'start-turn' }, key: 'turn-start:turn' },
      { part: { type: 'text-start', id: 'kept' }, startId: 'kept-attempt' },
      {
        part: { type: 'text-delta', id: 'kept', delta: 'Kept' },
        startId: 'kept-attempt',
      },
      { part: { type: 'text-end', id: 'kept' }, startId: 'kept-attempt' },
    ];
    const retractedRecords: HarnessAgentStreamPartRecord[] = [
      { part: { type: 'text-start', id: 'cut' }, startId: 'crashed-attempt' },
      {
        part: { type: 'text-delta', id: 'cut', delta: 'Cut off' },
        startId: 'crashed-attempt',
      },
    ];
    const finishRecords: HarnessAgentStreamPartRecord[] = [
      { part: finishStepPart, key: 'finish-step:turn:0' },
      {
        part: { type: 'finish-turn', finishReason, totalUsage: usage },
        key: 'finish-turn:turn',
      },
      { part: { type: 'settle' } },
    ];

    function createRetractedResult() {
      return createResult({
        records: [
          ...keptRecords,
          ...retractedRecords,
          { part: { type: 'retract', startIds: ['crashed-attempt'] } },
          {
            part: { type: 'text-delta', id: 'cut', delta: ' late' },
            startId: 'crashed-attempt',
          },
          { part: { type: 'text-start', id: 'retry' }, startId: 'retry' },
          {
            part: { type: 'text-delta', id: 'retry', delta: ' Retried' },
            startId: 'retry',
          },
          { part: { type: 'text-end', id: 'retry' }, startId: 'retry' },
          ...finishRecords,
        ],
      });
    }

    test('excludes retracted output from the steps and drops later records of retracted attempts', async () => {
      const result = createRetractedResult();

      expect(await result.text).toBe('Kept Retried');
      expect((await result.steps)[0].content).toEqual([
        { type: 'text', text: 'Kept' },
        { type: 'text', text: ' Retried' },
      ]);
    });

    test('keeps already delivered parts in fullStream without adding the reset', async () => {
      const result = createRetractedResult();

      expect(await readPartTypes(result.fullStream)).toEqual([
        'start',
        'custom',
        'start-step',
        'text-start',
        'text-delta',
        'text-end',
        'text-start',
        'text-delta',
        'text-start',
        'text-delta',
        'text-end',
        'finish-step',
        'custom',
        'finish',
      ]);
    });

    test('resets the step in the UI message stream and sends the surviving parts again', async () => {
      const result = createRetractedResult();

      const chunks: Array<{ type: string; delta?: string }> = [];
      for await (const chunk of result.toUIMessageStream()) {
        chunks.push(chunk as { type: string; delta?: string });
      }

      expect(
        chunks.map(chunk =>
          chunk.delta == null ? chunk.type : `${chunk.type}:${chunk.delta}`,
        ),
      ).toEqual([
        'start',
        'custom',
        'start-step',
        'text-start',
        'text-delta:Kept',
        'text-end',
        'text-start',
        'text-delta:Cut off',
        'reset-step',
        'text-start',
        'text-delta:Kept',
        'text-end',
        'text-start',
        'text-delta: Retried',
        'text-end',
        'finish-step',
        'custom',
        'finish',
      ]);
    });

    test('drops records whose key was already received', async () => {
      const result = createResult({
        records: [
          ...keptRecords,
          ...finishRecords.slice(0, 1),
          ...finishRecords.slice(0, 1),
          ...finishRecords.slice(1),
        ],
      });

      expect(await result.steps).toHaveLength(1);
    });
  });

  describe('multiple turns in one response', () => {
    const stepUsage = {
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    };

    test('streams start-turn and finish-turn boundaries across turns and aggregates totalUsage', async () => {
      const result = createResult({
        records: [
          {
            part: { type: 'start-turn', submissionIds: ['p1'] },
            key: 'turn-start:t1',
          },
          { part: { type: 'text-start', id: 't1' }, startId: 'a1' },
          {
            part: { type: 'text-delta', id: 't1', delta: 'first' },
            startId: 'a1',
          },
          { part: { type: 'text-end', id: 't1' }, startId: 'a1' },
          {
            part: {
              type: 'finish-step',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: stepUsage,
            },
            key: 'finish-step:t1:0',
          },
          {
            part: {
              type: 'finish-turn',
              finishReason: { unified: 'stop', raw: 'stop' },
              totalUsage: stepUsage,
            },
            key: 'finish-turn:t1',
          },
          {
            part: { type: 'start-turn', submissionIds: ['p2'] },
            key: 'turn-start:t2',
          },
          { part: { type: 'text-start', id: 't2' }, startId: 'a2' },
          {
            part: { type: 'text-delta', id: 't2', delta: 'second' },
            startId: 'a2',
          },
          { part: { type: 'text-end', id: 't2' }, startId: 'a2' },
          {
            part: {
              type: 'finish-step',
              finishReason: { unified: 'cancelled', raw: undefined },
              usage: stepUsage,
            },
            key: 'finish-step:t2:0',
          },
          {
            part: {
              type: 'finish-turn',
              finishReason: { unified: 'cancelled', raw: undefined },
              totalUsage: stepUsage,
            },
            key: 'finish-turn:t2',
          },
          { part: { type: 'settle' } },
        ],
      });

      const fullParts: Array<{ type: string; kind?: string }> = [];
      const fullStreamPromise = (async () => {
        for await (const part of result.fullStream) {
          fullParts.push(part as { type: string; kind?: string });
        }
      })();
      const uiChunks: Array<{ type: string; kind?: string }> = [];
      const uiStreamPromise = (async () => {
        for await (const chunk of result.toUIMessageStream()) {
          uiChunks.push(chunk as { type: string; kind?: string });
        }
      })();
      await Promise.all([fullStreamPromise, uiStreamPromise]);

      const format = (items: Array<{ type: string; kind?: string }>) =>
        items.map(item =>
          item.kind == null ? item.type : `${item.type}:${item.kind}`,
        );

      expect(format(fullParts)).toEqual([
        'start',
        'custom:harness.start-turn',
        'start-step',
        'text-start',
        'text-delta',
        'text-end',
        'finish-step',
        'custom:harness.finish-turn',
        'custom:harness.start-turn',
        'start-step',
        'text-start',
        'text-delta',
        'text-end',
        'finish-step',
        'custom:harness.finish-turn',
        'finish',
      ]);
      expect(format(uiChunks)).toEqual([
        'start',
        'custom:harness.start-turn',
        'start-step',
        'text-start',
        'text-delta',
        'text-end',
        'finish-step',
        'custom:harness.finish-turn',
        'custom:harness.start-turn',
        'start-step',
        'text-start',
        'text-delta',
        'text-end',
        'finish-step',
        'custom:harness.finish-turn',
        'finish',
      ]);
      expect((await result.steps).map(step => step.text)).toEqual([
        'first',
        'second',
      ]);
      expect(await result.totalUsage).toMatchObject({
        inputTokens: 20,
        outputTokens: 10,
      });
      expect(await result.finishReason).toBe('other');
      expect(await result.rawFinishReason).toBe('cancelled');
    });

    test('resets turnFinish on start-turn so a follow-up turn paused for approval uses its last step finishReason', async () => {
      const result = createResult({
        records: [
          {
            part: { type: 'start-turn', submissionIds: ['p1'] },
            key: 'turn-start:t1',
          },
          { part: { type: 'text-start', id: 't1' }, startId: 'a1' },
          {
            part: { type: 'text-delta', id: 't1', delta: 'done' },
            startId: 'a1',
          },
          { part: { type: 'text-end', id: 't1' }, startId: 'a1' },
          {
            part: {
              type: 'finish-step',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: stepUsage,
            },
            key: 'finish-step:t1:0',
          },
          {
            part: {
              type: 'finish-turn',
              finishReason: { unified: 'stop', raw: 'stop' },
              totalUsage: stepUsage,
            },
            key: 'finish-turn:t1',
          },
          {
            part: { type: 'start-turn', submissionIds: ['p2'] },
            key: 'turn-start:t2',
          },
          {
            part: {
              type: 'finish-step',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: stepUsage,
            },
            key: 'finish-step:t2:0',
          },
          { part: { type: 'settle' } },
        ],
      });

      expect(await result.finishReason).toBe('tool-calls');
      expect(await result.rawFinishReason).toBe('tool_use');
    });

    test('converts follow-up prompt-message and mid-turn steering-message to AI SDK steering-message while suppressing the initial turn prompt', async () => {
      const result = createResult({
        excludeInitialTurnPrompts: true,
        records: [
          {
            part: { type: 'start-turn', submissionIds: ['p1'] },
            key: 'turn-start:t1',
          },
          {
            part: {
              type: 'prompt-message',
              id: 'p1',
              message: { role: 'user', content: 'first prompt' },
            },
            key: 'prompt-message:p1',
          },
          {
            part: {
              type: 'steering-message',
              id: 's1',
              message: { role: 'user', content: 'mid-turn steer' },
            },
            key: 'steering-message:s1',
          },
          { part: { type: 'text-start', id: 't1' }, startId: 'a1' },
          {
            part: { type: 'text-delta', id: 't1', delta: 'first' },
            startId: 'a1',
          },
          { part: { type: 'text-end', id: 't1' }, startId: 'a1' },
          {
            part: {
              type: 'finish-step',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: stepUsage,
            },
            key: 'finish-step:t1:0',
          },
          {
            part: {
              type: 'finish-turn',
              finishReason: { unified: 'stop', raw: 'stop' },
              totalUsage: stepUsage,
            },
            key: 'finish-turn:t1',
          },
          {
            part: { type: 'start-turn', submissionIds: ['p2'] },
            key: 'turn-start:t2',
          },
          {
            part: {
              type: 'prompt-message',
              id: 'p2',
              message: { role: 'user', content: 'follow-up prompt' },
            },
            key: 'prompt-message:p2',
          },
          { part: { type: 'text-start', id: 't2' }, startId: 'a2' },
          {
            part: { type: 'text-delta', id: 't2', delta: 'second' },
            startId: 'a2',
          },
          { part: { type: 'text-end', id: 't2' }, startId: 'a2' },
          {
            part: {
              type: 'finish-step',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: stepUsage,
            },
            key: 'finish-step:t2:0',
          },
          {
            part: {
              type: 'finish-turn',
              finishReason: { unified: 'stop', raw: 'stop' },
              totalUsage: stepUsage,
            },
            key: 'finish-turn:t2',
          },
          { part: { type: 'settle' } },
        ],
      });

      const fullSteeringParts: unknown[] = [];
      const fullPromise = (async () => {
        for await (const part of result.fullStream) {
          if (part.type === 'steering-message') fullSteeringParts.push(part);
        }
      })();
      const uiSteeringChunks: unknown[] = [];
      const uiPromise = (async () => {
        for await (const chunk of result.toUIMessageStream()) {
          if (chunk.type === 'steering-message') uiSteeringChunks.push(chunk);
        }
      })();
      await Promise.all([fullPromise, uiPromise]);

      expect(fullSteeringParts).toEqual([
        {
          type: 'steering-message',
          id: 's1',
          message: { role: 'user', content: 'mid-turn steer' },
          stepNumber: 0,
        },
        {
          type: 'steering-message',
          id: 'p2',
          message: { role: 'user', content: 'follow-up prompt' },
          stepNumber: 1,
        },
      ]);
      expect(uiSteeringChunks).toEqual([
        {
          type: 'steering-message',
          id: 's1',
          parts: [{ type: 'text', text: 'mid-turn steer' }],
        },
        {
          type: 'steering-message',
          id: 'p2',
          parts: [{ type: 'text', text: 'follow-up prompt' }],
        },
      ]);
    });
  });
});
