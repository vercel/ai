import {
  APICallError,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { InvalidArgumentError, ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

// Timeouts in these tests are short so that every run stays well below the
// upper bounds asserted for elapsed time.
const CHUNK_TIMEOUT_MS = 100;
const FIRST_CHUNK_TIMEOUT_MS = 100;
const STEP_TIMEOUT_MS = 100;

function weatherTools() {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
    }),
  };
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function rejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

function expectTimeoutError(error: unknown, message: string) {
  expect((error as Error)?.name).toBe('TimeoutError');
  expect((error as Error)?.message).toBe(message);
}

/** A segment of a scripted provider stream. */
interface StreamSegment {
  /** Delay before the parts of this segment are enqueued. */
  afterMs: number;
  parts: LanguageModelV4StreamPart[];
  /** Close the stream after the parts of this segment. */
  close?: boolean;
}

interface ScheduledStreamModelOptions {
  /** Report the abort signal reason through the stream, like a provider. */
  honorAbort?: boolean;
}

/**
 * A model whose `doStream` plays the segments returned for each call. By
 * default the stream stays open after the last segment, which is the state a
 * timeout has to end.
 */
function scheduledStreamModel(
  segmentsForCall: (callIndex: number) => StreamSegment[],
  { honorAbort = true }: ScheduledStreamModelOptions = {},
) {
  const signals: Array<AbortSignal | undefined> = [];
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      const callIndex = signals.length;
      signals.push(abortSignal);
      const segments = segmentsForCall(callIndex);

      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            let aborted = false;
            const fail = () => {
              if (aborted) return;
              aborted = true;
              try {
                controller.error(abortSignal?.reason);
              } catch {
                // The stream is already closed or errored.
              }
            };
            if (honorAbort) {
              if (abortSignal?.aborted) {
                fail();
              } else {
                abortSignal?.addEventListener('abort', fail, { once: true });
              }
            }

            void (async () => {
              for (const segment of segments) {
                if (segment.afterMs > 0) await sleep(segment.afterMs);
                if (aborted) return;
                for (const part of segment.parts) controller.enqueue(part);
                if (segment.close) {
                  controller.close();
                  return;
                }
              }
            })();
          },
          cancel() {
            // Nothing to release: the scripted parts come from timers.
          },
        }),
      };
    },
  });

  return { model, signals };
}

function streamStart(): LanguageModelV4StreamPart {
  return { type: 'stream-start', warnings: [] };
}

function responseMetadata(): LanguageModelV4StreamPart {
  return {
    type: 'response-metadata',
    id: 'response-fixture',
    timestamp: new Date(0),
    modelId: 'mock-model-id',
  };
}

function textStart(id: string): LanguageModelV4StreamPart {
  return { type: 'text-start', id };
}

function textDelta(id: string, delta: string): LanguageModelV4StreamPart {
  return { type: 'text-delta', id, delta };
}

function textEnd(id: string): LanguageModelV4StreamPart {
  return { type: 'text-end', id };
}

function finishStop(): LanguageModelV4StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 2,
        cacheRead: 1,
        cacheWrite: undefined,
      },
      outputTokens: { total: 2, text: 2, reasoning: undefined },
    },
  };
}

function streamPartsFor(
  response: LanguageModelV4GenerateResult,
): LanguageModelV4StreamPart[] {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: response.warnings },
    { type: 'response-metadata', ...response.response },
  ];

  for (const [index, part] of response.content.entries()) {
    switch (part.type) {
      case 'text': {
        const id = `text-${index}`;
        parts.push(
          { type: 'text-start', id },
          { type: 'text-delta', id, delta: part.text },
          { type: 'text-end', id },
        );
        break;
      }
      case 'tool-call':
        parts.push(part);
        break;
      default:
        throw new Error(`Unsupported fixture content: ${part.type}`);
    }
  }

  parts.push({
    type: 'finish',
    finishReason: response.finishReason,
    usage: response.usage,
    providerMetadata: response.providerMetadata,
  });

  return parts;
}

/** The same scripted responses for tool-loop generate and workflow stream. */
function delayedModel(
  responses: LanguageModelV4GenerateResult[],
  delayMs: number,
) {
  let generateCalls = 0;
  let streamCalls = 0;

  return new MockLanguageModelV4({
    doGenerate: async () => {
      await sleep(delayMs);
      return responses[generateCalls++];
    },
    doStream: async () => {
      const response = responses[streamCalls++];
      await sleep(delayMs);
      return { stream: convertArrayToReadableStream(streamPartsFor(response)) };
    },
  });
}

/** A model whose `doGenerate` waits for the abort signal and reports it. */
function hangingGenerateModel() {
  const signals: Array<AbortSignal | undefined> = [];
  const model = new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) => {
      signals.push(abortSignal);
      return new Promise<LanguageModelV4GenerateResult>((_, reject) => {
        if (abortSignal?.aborted) {
          reject(abortSignal.reason);
          return;
        }
        abortSignal?.addEventListener(
          'abort',
          () => reject(abortSignal.reason),
          { once: true },
        );
      });
    },
  });

  return { model, signals };
}

function textResponse(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 2,
        cacheRead: 1,
        cacheWrite: undefined,
      },
      outputTokens: { total: 2, text: 2, reasoning: undefined },
    },
    warnings: [],
    response: {
      id: 'response-fixture',
      timestamp: new Date(0),
      modelId: 'mock-model-id',
    },
  };
}

function toolResponse(): LanguageModelV4GenerateResult {
  return {
    ...textResponse('Checking the weather.'),
    content: [
      { type: 'text', text: 'Checking the weather.' },
      {
        type: 'tool-call',
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: '{"city":"London"}',
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
  };
}

describe('WorkflowAgent timeout configuration', () => {
  beforeEach(() => {
    vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stream() with chunkMs aborts both agents when the model goes quiet after output', async () => {
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [
          streamStart(),
          responseMetadata(),
          textStart('text-1'),
          textDelta('text-1', 'Hello'),
        ],
      },
    ];

    const workflowOnAbort = vi.fn();
    const workflowOnError = vi.fn();
    const workflowOnEnd = vi.fn();
    const workflowModel = scheduledStreamModel(segments);
    const workflowStartedAt = Date.now();
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      maxRetries: 0,
    }).stream({
      prompt,
      timeout: { chunkMs: CHUNK_TIMEOUT_MS },
      onAbort: workflowOnAbort,
      onError: workflowOnError,
      onEnd: workflowOnEnd,
    });

    expect(Date.now() - workflowStartedAt).toBeLessThan(1500);
    expect(workflowResult.steps).toHaveLength(0);
    expect(workflowOnAbort).toHaveBeenCalledTimes(1);
    expect(workflowOnError).not.toHaveBeenCalled();
    expect(workflowOnEnd).not.toHaveBeenCalled();
    expectTimeoutError(
      workflowModel.signals[0]?.reason,
      `Chunk timeout of ${CHUNK_TIMEOUT_MS}ms exceeded`,
    );

    const coreOnAbort = vi.fn();
    const coreModel = scheduledStreamModel(segments);
    const coreStartedAt = Date.now();
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      maxRetries: 0,
      onAbort: coreOnAbort,
    }).stream({ prompt, timeout: { chunkMs: CHUNK_TIMEOUT_MS } });
    await coreResult.consumeStream();

    expect(Date.now() - coreStartedAt).toBeLessThan(1500);
    expectTimeoutError(
      await rejection(coreResult.steps),
      `Chunk timeout of ${CHUNK_TIMEOUT_MS}ms exceeded`,
    );
    expect(coreOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      coreModel.signals[0]?.reason,
      `Chunk timeout of ${CHUNK_TIMEOUT_MS}ms exceeded`,
    );
  });

  it('stream() with firstChunkMs aborts both agents when only non-output parts arrive', async () => {
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [
          streamStart(),
          responseMetadata(),
          textStart('text-1'),
          // An empty delta is not model output and does not start a timer.
          textDelta('text-1', ''),
        ],
      },
    ];

    const workflowOnAbort = vi.fn();
    const workflowModel = scheduledStreamModel(segments);
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      maxRetries: 0,
    }).stream({
      prompt,
      timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
      onAbort: workflowOnAbort,
    });

    expect(workflowResult.steps).toHaveLength(0);
    expect(workflowOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      workflowModel.signals[0]?.reason,
      `First chunk timeout of ${FIRST_CHUNK_TIMEOUT_MS}ms exceeded`,
    );

    const coreOnAbort = vi.fn();
    const coreModel = scheduledStreamModel(segments);
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      maxRetries: 0,
      onAbort: coreOnAbort,
    }).stream({ prompt, timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS } });
    await coreResult.consumeStream();

    expectTimeoutError(
      await rejection(coreResult.steps),
      `First chunk timeout of ${FIRST_CHUNK_TIMEOUT_MS}ms exceeded`,
    );
    expect(coreOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      coreModel.signals[0]?.reason,
      `First chunk timeout of ${FIRST_CHUNK_TIMEOUT_MS}ms exceeded`,
    );
  });

  it('stream() with stepMs aborts both agents during the model call', async () => {
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [
          streamStart(),
          responseMetadata(),
          textStart('text-1'),
          textDelta('text-1', 'Hello'),
        ],
      },
    ];

    const workflowOnAbort = vi.fn();
    const workflowModel = scheduledStreamModel(segments);
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      maxRetries: 0,
    }).stream({
      prompt,
      timeout: { stepMs: STEP_TIMEOUT_MS },
      onAbort: workflowOnAbort,
    });

    expect(workflowResult.steps).toHaveLength(0);
    expect(workflowOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      workflowModel.signals[0]?.reason,
      `Step timeout of ${STEP_TIMEOUT_MS}ms exceeded`,
    );

    const coreOnAbort = vi.fn();
    const coreModel = scheduledStreamModel(segments);
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      maxRetries: 0,
      onAbort: coreOnAbort,
    }).stream({ prompt, timeout: { stepMs: STEP_TIMEOUT_MS } });
    await coreResult.consumeStream();

    expectTimeoutError(
      await rejection(coreResult.steps),
      `Step timeout of ${STEP_TIMEOUT_MS}ms exceeded`,
    );
    expect(coreOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      coreModel.signals[0]?.reason,
      `Step timeout of ${STEP_TIMEOUT_MS}ms exceeded`,
    );
  });

  it('stream() with totalMs behaves like a numeric timeout', async () => {
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [
          streamStart(),
          textStart('text-1'),
          textDelta('text-1', 'Hello'),
        ],
      },
    ];

    for (const timeout of [{ totalMs: CHUNK_TIMEOUT_MS }, CHUNK_TIMEOUT_MS]) {
      const onAbort = vi.fn();
      const onEnd = vi.fn();
      const { model } = scheduledStreamModel(segments);
      const startedAt = Date.now();
      const result = await new WorkflowAgent({
        model,
        maxRetries: 0,
      }).stream({ prompt, timeout, onAbort, onEnd });

      expect(Date.now() - startedAt).toBeLessThan(1500);
      expect(result.steps).toHaveLength(0);
      expect(onAbort).toHaveBeenCalledTimes(1);
      expect(onEnd).not.toHaveBeenCalled();
    }
  });

  it('does not reset the chunk timer for empty text deltas', async () => {
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [
          streamStart(),
          responseMetadata(),
          textStart('text-1'),
          textDelta('text-1', 'Hello'),
        ],
      },
      ...Array.from({ length: 20 }, () => ({
        afterMs: 20,
        parts: [textDelta('text-1', '')],
      })),
    ];

    const workflowOnAbort = vi.fn();
    const workflowModel = scheduledStreamModel(segments);
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      maxRetries: 0,
    }).stream({
      prompt,
      timeout: { chunkMs: CHUNK_TIMEOUT_MS },
      onAbort: workflowOnAbort,
    });

    expect(workflowResult.steps).toHaveLength(0);
    expect(workflowOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      workflowModel.signals[0]?.reason,
      `Chunk timeout of ${CHUNK_TIMEOUT_MS}ms exceeded`,
    );

    const coreOnAbort = vi.fn();
    const coreModel = scheduledStreamModel(segments);
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      maxRetries: 0,
      onAbort: coreOnAbort,
    }).stream({ prompt, timeout: { chunkMs: CHUNK_TIMEOUT_MS } });
    await coreResult.consumeStream();

    expectTimeoutError(
      await rejection(coreResult.steps),
      `Chunk timeout of ${CHUNK_TIMEOUT_MS}ms exceeded`,
    );
    expect(coreOnAbort).toHaveBeenCalledTimes(1);
  });

  it('resets the chunk timer for text deltas', async () => {
    const deltas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [streamStart(), responseMetadata(), textStart('text-1')],
      },
      ...deltas.map(delta => ({
        afterMs: 40,
        parts: [textDelta('text-1', delta)],
      })),
      { afterMs: 0, parts: [textEnd('text-1'), finishStop()], close: true },
    ];

    const workflowModel = scheduledStreamModel(segments);
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      maxRetries: 0,
    }).stream({ prompt, timeout: { chunkMs: 150 } });

    const coreModel = scheduledStreamModel(segments);
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      maxRetries: 0,
    }).stream({ prompt, timeout: { chunkMs: 150 } });
    const coreSteps = await coreResult.steps;

    expect(workflowResult.steps).toHaveLength(1);
    expect(coreSteps).toHaveLength(1);
    expect(workflowResult.steps[0].text).toBe('abcdefgh');
    expect(workflowResult.steps[0].text).toBe(coreSteps[0].text);
  });

  it('resets the chunk timer for reasoning deltas', async () => {
    const deltas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const segments = (): StreamSegment[] => [
      { afterMs: 0, parts: [streamStart(), responseMetadata()] },
      {
        afterMs: 0,
        parts: [{ type: 'reasoning-start', id: 'reasoning-1' }],
      },
      ...deltas.map(delta => ({
        afterMs: 40,
        parts: [{ type: 'reasoning-delta' as const, id: 'reasoning-1', delta }],
      })),
      {
        afterMs: 0,
        parts: [{ type: 'reasoning-end', id: 'reasoning-1' }, finishStop()],
        close: true,
      },
    ];

    const workflowModel = scheduledStreamModel(segments);
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      maxRetries: 0,
    }).stream({ prompt, timeout: { chunkMs: 150 } });

    const coreModel = scheduledStreamModel(segments);
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      maxRetries: 0,
    }).stream({ prompt, timeout: { chunkMs: 150 } });
    const coreSteps = await coreResult.steps;

    expect(workflowResult.steps).toHaveLength(1);
    expect(coreSteps).toHaveLength(1);
    expect(workflowResult.steps[0].reasoningText).toBe('abcdefgh');
    expect(workflowResult.steps[0].reasoningText).toBe(
      coreSteps[0].reasoningText,
    );
  });

  it('resets the chunk timer for tool input deltas', async () => {
    const deltas = ['{"ci', 'ty":', '"Lon', 'don"}'];
    const segments = (): StreamSegment[] => [
      { afterMs: 0, parts: [streamStart(), responseMetadata()] },
      {
        afterMs: 0,
        parts: [
          { type: 'tool-input-start', id: 'call-1', toolName: 'weather' },
        ],
      },
      ...deltas.map(delta => ({
        afterMs: 40,
        parts: [{ type: 'tool-input-delta' as const, id: 'call-1', delta }],
      })),
      {
        afterMs: 0,
        parts: [
          { type: 'tool-input-end', id: 'call-1' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: '{"city":"London"}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            usage: {
              inputTokens: {
                total: 3,
                noCache: 2,
                cacheRead: 1,
                cacheWrite: undefined,
              },
              outputTokens: { total: 2, text: 2, reasoning: undefined },
            },
          },
        ],
        close: true,
      },
    ];

    // A tool without `execute` ends the run after the first step.
    const tools = {
      weather: tool({ inputSchema: z.object({ city: z.string() }) }),
    };
    const workflowModel = scheduledStreamModel(segments);
    const workflowResult = await new WorkflowAgent({
      model: workflowModel.model,
      tools,
      maxRetries: 0,
    }).stream({ prompt, timeout: { chunkMs: 150 } });

    const coreModel = scheduledStreamModel(segments);
    const coreResult = await new ToolLoopAgent({
      model: coreModel.model,
      tools,
      maxRetries: 0,
    }).stream({ prompt, timeout: { chunkMs: 150 } });
    const coreSteps = await coreResult.steps;

    expect(workflowResult.steps).toHaveLength(1);
    expect(coreSteps).toHaveLength(1);
    expect(workflowResult.steps[0].toolCalls).toMatchObject([
      { toolName: 'weather', input: { city: 'London' } },
    ]);
    expect(coreSteps[0].toolCalls).toMatchObject([
      { toolName: 'weather', input: { city: 'London' } },
    ]);
  });

  it('starts the step timer again for every model call', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];
    const timeout = { stepMs: 150 };

    for (const mode of ['generate', 'stream'] as const) {
      const workflowModel = delayedModel(responses, 80);
      const workflowAgent = new WorkflowAgent({
        model: workflowModel,
        tools: weatherTools(),
        maxRetries: 0,
      });
      const workflowResult =
        mode === 'generate'
          ? await workflowAgent.generate({ prompt, timeout })
          : await workflowAgent.stream({ prompt, timeout });

      const coreModel = delayedModel(responses, 80);
      const coreAgent = new ToolLoopAgent({
        model: coreModel,
        tools: weatherTools(),
        maxRetries: 0,
      });
      const coreResult =
        mode === 'generate'
          ? await coreAgent.generate({ prompt, timeout })
          : await coreAgent.stream({ prompt, timeout });

      expect(workflowResult.steps).toHaveLength(2);
      const workflowText = workflowResult.steps.at(-1)?.text;
      expect(workflowText).toBe('It is 18°C.');

      if (mode === 'generate') {
        expect(coreResult.steps).toHaveLength(2);
        expect(workflowText).toBe(coreResult.text);
      } else {
        expect(await coreResult.steps).toHaveLength(2);
        expect(workflowText).toBe(await coreResult.text);
      }
    }
  });

  it('applies the first-chunk timeout to every model call', async () => {
    const segments = (callIndex: number): StreamSegment[] =>
      callIndex === 0
        ? [{ afterMs: 0, parts: streamPartsFor(toolResponse()), close: true }]
        : [
            {
              afterMs: 0,
              parts: [streamStart(), responseMetadata(), textStart('text-1')],
            },
          ];

    const onAbort = vi.fn();
    const { model, signals } = scheduledStreamModel(segments);
    const result = await new WorkflowAgent({
      model,
      tools: weatherTools(),
      maxRetries: 0,
    }).stream({
      prompt,
      timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
      onAbort,
    });

    expect(result.steps).toHaveLength(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(signals).toHaveLength(2);
    expectTimeoutError(
      signals[1]?.reason,
      `First chunk timeout of ${FIRST_CHUNK_TIMEOUT_MS}ms exceeded`,
    );
  });

  it('ends when the provider ignores the abort signal', async () => {
    const segments = (): StreamSegment[] => [
      {
        afterMs: 0,
        parts: [
          streamStart(),
          responseMetadata(),
          textStart('text-1'),
          textDelta('text-1', 'Hello'),
        ],
      },
    ];

    for (const timeout of [{ chunkMs: CHUNK_TIMEOUT_MS }, CHUNK_TIMEOUT_MS]) {
      const workflowOnAbort = vi.fn();
      const workflowModel = scheduledStreamModel(segments, {
        honorAbort: false,
      });
      const workflowStartedAt = Date.now();
      const workflowResult = await new WorkflowAgent({
        model: workflowModel.model,
        maxRetries: 0,
      }).stream({ prompt, timeout, onAbort: workflowOnAbort });

      expect(Date.now() - workflowStartedAt).toBeLessThan(1500);
      expect(workflowResult.steps).toHaveLength(0);
      expect(workflowOnAbort).toHaveBeenCalledTimes(1);

      const coreOnAbort = vi.fn();
      const coreModel = scheduledStreamModel(segments, { honorAbort: false });
      const coreStartedAt = Date.now();
      const coreResult = await new ToolLoopAgent({
        model: coreModel.model,
        maxRetries: 0,
        onAbort: coreOnAbort,
      }).stream({ prompt, timeout });
      await coreResult.consumeStream();

      expect(Date.now() - coreStartedAt).toBeLessThan(1500);
      await expect(rejection(coreResult.steps)).resolves.not.toBeUndefined();
      expect(coreOnAbort).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects generate() with a step timeout in both agents', async () => {
    const workflow = hangingGenerateModel();
    const workflowError = await rejection(
      new WorkflowAgent({ model: workflow.model, maxRetries: 0 }).generate({
        prompt,
        timeout: { stepMs: STEP_TIMEOUT_MS },
      }),
    );

    expectTimeoutError(
      workflowError,
      `Step timeout of ${STEP_TIMEOUT_MS}ms exceeded`,
    );

    const core = hangingGenerateModel();
    const coreError = await rejection(
      new ToolLoopAgent({ model: core.model, maxRetries: 0 }).generate({
        prompt,
        timeout: { stepMs: STEP_TIMEOUT_MS },
      }),
    );

    expectTimeoutError(
      coreError,
      `Step timeout of ${STEP_TIMEOUT_MS}ms exceeded`,
    );
  });

  it('rejects generate() with a total timeout in both agents', async () => {
    const workflow = hangingGenerateModel();
    const workflowError = await rejection(
      new WorkflowAgent({ model: workflow.model, maxRetries: 0 }).generate({
        prompt,
        timeout: { totalMs: CHUNK_TIMEOUT_MS },
      }),
    );

    expect((workflowError as Error)?.name).toBe('TimeoutError');

    const core = hangingGenerateModel();
    const coreError = await rejection(
      new ToolLoopAgent({ model: core.model, maxRetries: 0 }).generate({
        prompt,
        timeout: { totalMs: CHUNK_TIMEOUT_MS },
      }),
    );

    expect((coreError as Error)?.name).toBe('TimeoutError');
  });

  it('ignores firstChunkMs and chunkMs in generate()', async () => {
    const responses = [textResponse('It is 18°C.')];
    const timeout = { firstChunkMs: 10, chunkMs: 10 };

    const workflowResult = await new WorkflowAgent({
      model: delayedModel(responses, 60),
      maxRetries: 0,
    }).generate({ prompt, timeout });
    const coreResult = await new ToolLoopAgent({
      model: delayedModel(responses, 60),
      maxRetries: 0,
    }).generate({ prompt, timeout });

    expect(workflowResult.steps).toHaveLength(1);
    expect(workflowResult.text).toBe('It is 18°C.');
    expect(coreResult.steps).toHaveLength(1);
    expect(workflowResult.text).toBe(coreResult.text);
  });

  it('ends stream() quickly when an external signal aborts before a long step timeout', async () => {
    const segments = (): StreamSegment[] => [
      { afterMs: 0, parts: [streamStart(), textStart('text-1')] },
    ];

    const onAbort = vi.fn();
    const { model } = scheduledStreamModel(segments);
    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 50);
    const startedAt = Date.now();
    const result = await new WorkflowAgent({
      model,
      maxRetries: 0,
    }).stream({
      prompt,
      timeout: { stepMs: 5000 },
      abortSignal: abortController.signal,
      onAbort,
    });

    expect(Date.now() - startedAt).toBeLessThan(1500);
    expect(result.steps).toHaveLength(0);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('counts SDK retries inside the step timeout', async () => {
    function retryThenStallModel() {
      const signals: Array<AbortSignal | undefined> = [];
      let calls = 0;
      const model = new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signals.push(abortSignal);
          calls++;

          if (calls === 1) {
            throw new APICallError({
              message: 'Retryable fixture failure',
              url: 'https://example.com/model',
              requestBodyValues: {},
              statusCode: 503,
              isRetryable: true,
              responseHeaders: { 'retry-after-ms': '0' },
            });
          }

          return {
            stream: new ReadableStream<LanguageModelV4StreamPart>({
              start(controller) {
                controller.enqueue(streamStart());
                controller.enqueue(textStart('text-1'));
                if (abortSignal?.aborted) {
                  controller.error(abortSignal.reason);
                  return;
                }
                abortSignal?.addEventListener(
                  'abort',
                  () => controller.error(abortSignal.reason),
                  { once: true },
                );
              },
            }),
          };
        },
      });

      return { model, signals };
    }

    const workflow = retryThenStallModel();
    const workflowOnAbort = vi.fn();
    const workflowResult = await new WorkflowAgent({
      model: workflow.model,
      maxRetries: 2,
    }).stream({
      prompt,
      timeout: { stepMs: 200 },
      onAbort: workflowOnAbort,
    });

    expect(workflow.model.doStreamCalls).toHaveLength(2);
    expect(workflowResult.steps).toHaveLength(0);
    expect(workflowOnAbort).toHaveBeenCalledTimes(1);
    expectTimeoutError(
      workflow.signals[1]?.reason,
      'Step timeout of 200ms exceeded',
    );

    const core = retryThenStallModel();
    const coreOnAbort = vi.fn();
    const coreResult = await new ToolLoopAgent({
      model: core.model,
      maxRetries: 2,
      onAbort: coreOnAbort,
    }).stream({ prompt, timeout: { stepMs: 200 } });
    await coreResult.consumeStream();

    expect(core.model.doStreamCalls).toHaveLength(2);
    expectTimeoutError(
      await rejection(coreResult.steps),
      'Step timeout of 200ms exceeded',
    );
    expect(coreOnAbort).toHaveBeenCalledTimes(1);
  });

  describe('timeout validation', () => {
    const invalidTimeouts: Array<[string, unknown, string]> = [
      ['NaN', NaN, 'timeout'],
      ['Infinity', Infinity, 'timeout'],
      ['a value above the timer limit', 2 ** 31, 'timeout'],
      ['a string', '1000', 'timeout'],
      ['a NaN totalMs', { totalMs: NaN }, 'timeout.totalMs'],
      ['a negative stepMs', { stepMs: -1 }, 'timeout.stepMs'],
      [
        'an infinite firstChunkMs',
        { firstChunkMs: Infinity },
        'timeout.firstChunkMs',
      ],
      [
        'a chunkMs above the timer limit',
        { chunkMs: 2 ** 31 },
        'timeout.chunkMs',
      ],
    ];

    for (const mode of ['stream', 'generate'] as const) {
      it.each(invalidTimeouts)(
        `${mode}() rejects %s before the model call`,
        async (_label, timeout, parameter) => {
          const segments = (): StreamSegment[] => [
            { afterMs: 0, parts: [streamStart(), finishStop()], close: true },
          ];
          const { model } = scheduledStreamModel(segments);
          const agent = new WorkflowAgent({ model, maxRetries: 0 });

          const error = await rejection(
            agent[mode]({
              prompt,
              timeout: timeout as never,
            }) as Promise<unknown>,
          );

          expect(InvalidArgumentError.isInstance(error)).toBe(true);
          expect((error as Error).message).toContain(parameter);
          expect(model.doStreamCalls).toHaveLength(0);
          expect(model.doGenerateCalls).toHaveLength(0);
        },
      );
    }

    it.each([
      ['a negative number', -1],
      ['a negative totalMs', { totalMs: -1 }],
    ])('treats %s as a deadline that has passed', async (_label, timeout) => {
      const segments = (): StreamSegment[] => [
        { afterMs: 0, parts: [streamStart(), finishStop()], close: true },
      ];

      const stream = scheduledStreamModel(segments);
      const onAbort = vi.fn();
      const streamResult = await new WorkflowAgent({
        model: stream.model,
        maxRetries: 0,
      }).stream({ prompt, timeout, onAbort });

      expect(streamResult.steps).toHaveLength(0);
      expect(onAbort).toHaveBeenCalledTimes(1);
      expect(stream.model.doStreamCalls).toHaveLength(0);

      const generate = scheduledStreamModel(segments);
      const error = await rejection(
        new WorkflowAgent({ model: generate.model, maxRetries: 0 }).generate({
          prompt,
          timeout,
        }),
      );

      expect((error as Error).name).toBe('TimeoutError');
      expect(generate.model.doGenerateCalls).toHaveLength(0);
    });

    it('accepts a fractional total timeout in stream()', async () => {
      const segments = (): StreamSegment[] => [
        { afterMs: 0, parts: [streamStart(), textStart('text-1')] },
      ];
      const onAbort = vi.fn();
      const { model } = scheduledStreamModel(segments);
      const result = await new WorkflowAgent({
        model,
        maxRetries: 0,
      }).stream({
        prompt,
        timeout: { totalMs: 100.5 },
        onAbort,
      });

      expect(result.steps).toHaveLength(0);
      expect(onAbort).toHaveBeenCalledTimes(1);
    });
  });
});
