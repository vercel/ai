import {
  streamObject,
  streamText,
} from '../../../../packages/ai/dist/index.mjs';
import { MockLanguageModelV2 } from '../../../../packages/ai/dist/test/index.mjs';

const failureSignal =
  'ISSUE_19161_REPRODUCED: callback throws break downstream streams and prevent completion hooks';
const providerErrorMessage = 'provider api failure';

type Settled<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: string }
  | { status: 'timeout' };

type SpanRecord = {
  name: string;
  endCalls: number;
};

class TestSpan {
  readonly name: string;
  endCalls = 0;

  constructor(name: string) {
    this.name = name;
  }

  spanContext() {
    return { traceId: 'trace', spanId: 'span', traceFlags: 0 };
  }

  setAttribute() {
    return this;
  }

  setAttributes() {
    return this;
  }

  addEvent() {
    return this;
  }

  addLink() {
    return this;
  }

  addLinks() {
    return this;
  }

  setStatus() {
    return this;
  }

  updateName() {
    return this;
  }

  end() {
    this.endCalls++;
    return this;
  }

  isRecording() {
    return false;
  }

  recordException() {}
}

class TestTracer {
  readonly spans: TestSpan[] = [];

  startSpan(name: string) {
    const span = new TestSpan(name);
    this.spans.push(span);
    return span;
  }

  startActiveSpan(
    name: string,
    arg1: unknown,
    arg2?: unknown,
    arg3?: (span: TestSpan) => unknown,
  ) {
    const callback =
      typeof arg1 === 'function'
        ? arg1
        : typeof arg2 === 'function'
          ? arg2
          : arg3;

    if (callback == null) {
      throw new Error('Unexpected tracer call without a callback');
    }

    const span = new TestSpan(name);
    this.spans.push(span);
    return callback(span);
  }

  records(): SpanRecord[] {
    return this.spans.map(({ name, endCalls }) => ({ name, endCalls }));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function settle<T>(
  promise: PromiseLike<T>,
  timeoutMs = 1_000,
): Promise<Settled<T>> {
  return Promise.race([
    Promise.resolve(promise).then(
      value => ({ status: 'fulfilled', value }) as const,
      reason =>
        ({
          status: 'rejected',
          reason: errorMessage(reason),
        }) as const,
    ),
    new Promise<{ status: 'timeout' }>(resolve => {
      setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
    }),
  ]);
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<Settled<T[]>> {
  try {
    const values: T[] = [];
    for await (const value of iterable) {
      values.push(value);
    }
    return { status: 'fulfilled', value: values };
  } catch (error) {
    return { status: 'rejected', reason: errorMessage(error) };
  }
}

function modelStream(parts: unknown[]) {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  }) as never;
}

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
};

function textProviderParts({ includeError }: { includeError: boolean }) {
  return [
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: 'response-id',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
    { type: 'text-start', id: 'text-id' },
    { type: 'text-delta', id: 'text-id', delta: 'ok' },
    ...(includeError
      ? [{ type: 'error', error: new Error(providerErrorMessage) }]
      : []),
    { type: 'text-end', id: 'text-id' },
    {
      type: 'finish',
      finishReason: includeError ? 'error' : 'stop',
      usage,
    },
  ];
}

async function runStreamTextScenario(kind: 'onError' | 'onChunk') {
  const callbackErrorMessage = `streamText ${kind} callback throw`;
  const tracer = new TestTracer();
  const callbackErrors: string[] = [];
  let onStepFinishCalls = 0;
  let onFinishCalls = 0;

  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: modelStream(
          textProviderParts({ includeError: kind === 'onError' }),
        ),
      }),
    }),
    prompt: 'hi',
    onError:
      kind === 'onError'
        ? ({ error }) => {
            callbackErrors.push(errorMessage(error));
            throw new Error(callbackErrorMessage);
          }
        : undefined,
    onChunk:
      kind === 'onChunk'
        ? ({ chunk }) => {
            if (chunk.type === 'text-delta') {
              throw new Error(callbackErrorMessage);
            }
          }
        : undefined,
    onStepFinish() {
      onStepFinishCalls++;
    },
    onFinish() {
      onFinishCalls++;
    },
    experimental_telemetry: {
      isEnabled: true,
      tracer: tracer as never,
    },
  });

  const [fullStream, textStream, steps, finishReason] = await Promise.all([
    collect(result.fullStream),
    collect(result.textStream),
    settle(result.steps),
    settle(result.finishReason),
  ]);

  return {
    callbackErrorMessage,
    callbackErrors,
    fullStream,
    textStream,
    steps:
      steps.status === 'fulfilled'
        ? { status: steps.status, value: steps.value.length }
        : steps,
    finishReason,
    onStepFinishCalls,
    onFinishCalls,
    spans: tracer.records(),
  };
}

function objectProviderParts() {
  return [
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: 'response-id',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
    { type: 'text-delta', id: 'text-id', delta: '{"content":"ok"}' },
    { type: 'error', error: new Error(providerErrorMessage) },
    {
      type: 'finish',
      finishReason: 'error',
      usage,
    },
  ];
}

async function runStreamObjectConsumer(
  consumer: 'fullStream' | 'partialObjectStream' | 'textStream',
) {
  const callbackErrorMessage = 'streamObject onError callback throw';
  const tracer = new TestTracer();
  const callbackErrors: string[] = [];
  let onFinishCalls = 0;

  const result = streamObject({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: modelStream(objectProviderParts()),
      }),
    }),
    output: 'no-schema',
    prompt: 'hi',
    onError({ error }) {
      callbackErrors.push(errorMessage(error));
      throw new Error(callbackErrorMessage);
    },
    onFinish() {
      onFinishCalls++;
    },
    experimental_telemetry: {
      isEnabled: true,
      tracer: tracer as never,
    },
  });

  return {
    consumer,
    callbackErrorMessage,
    callbackErrors,
    stream: await collect(result[consumer] as AsyncIterable<unknown>),
    onFinishCalls,
    spans: tracer.records(),
  };
}

function rejectedWith(
  result: Settled<unknown>,
  expectedMessage: string,
): boolean {
  return result.status === 'rejected' && result.reason === expectedMessage;
}

function rootSpanEnded(spans: SpanRecord[], name: string): boolean {
  return spans.some(span => span.name === name && span.endCalls === 1);
}

function textScenarioIsFixed(
  result: Awaited<ReturnType<typeof runStreamTextScenario>>,
  expectedFinishReason: 'error' | 'stop',
): boolean {
  const fullStreamHasExpectedFinish =
    result.fullStream.status === 'fulfilled' &&
    result.fullStream.value.some(
      part =>
        typeof part === 'object' &&
        part != null &&
        'type' in part &&
        part.type === 'finish',
    );

  const textCompleted =
    result.textStream.status === 'fulfilled' &&
    result.textStream.value.join('') === 'ok';

  return (
    fullStreamHasExpectedFinish &&
    textCompleted &&
    result.steps.status === 'fulfilled' &&
    result.steps.value === 1 &&
    result.finishReason.status === 'fulfilled' &&
    result.finishReason.value === expectedFinishReason &&
    result.onStepFinishCalls === 1 &&
    result.onFinishCalls === 1 &&
    rootSpanEnded(result.spans, 'ai.streamText')
  );
}

function objectScenarioIsFixed(
  result: Awaited<ReturnType<typeof runStreamObjectConsumer>>,
): boolean {
  return (
    result.stream.status === 'fulfilled' &&
    result.onFinishCalls === 1 &&
    rootSpanEnded(result.spans, 'ai.streamObject')
  );
}

async function main() {
  const [streamTextOnError, streamTextOnChunk] = await Promise.all([
    runStreamTextScenario('onError'),
    runStreamTextScenario('onChunk'),
  ]);

  const streamObjectResults = await Promise.all([
    runStreamObjectConsumer('fullStream'),
    runStreamObjectConsumer('partialObjectStream'),
    runStreamObjectConsumer('textStream'),
  ]);

  const observations = {
    streamTextOnError,
    streamTextOnChunk,
    streamObjectResults,
  };

  console.log(JSON.stringify(observations, null, 2));

  const fixed =
    textScenarioIsFixed(streamTextOnError, 'error') &&
    streamTextOnError.callbackErrors.includes(providerErrorMessage) &&
    textScenarioIsFixed(streamTextOnChunk, 'stop') &&
    streamObjectResults.every(
      result =>
        objectScenarioIsFixed(result) &&
        result.callbackErrors.includes(providerErrorMessage),
    );

  if (fixed) {
    console.log(
      'Issue #19161 expected callback isolation behavior is present.',
    );
    return;
  }

  const reproduced =
    streamTextOnError.callbackErrors.includes(providerErrorMessage) &&
    rejectedWith(
      streamTextOnError.fullStream,
      streamTextOnError.callbackErrorMessage,
    ) &&
    rejectedWith(
      streamTextOnError.textStream,
      streamTextOnError.callbackErrorMessage,
    ) &&
    streamTextOnError.onFinishCalls === 0 &&
    streamTextOnChunk.callbackErrors.length === 0 &&
    rejectedWith(
      streamTextOnChunk.fullStream,
      streamTextOnChunk.callbackErrorMessage,
    ) &&
    rejectedWith(
      streamTextOnChunk.textStream,
      streamTextOnChunk.callbackErrorMessage,
    ) &&
    streamTextOnChunk.onStepFinishCalls === 0 &&
    streamTextOnChunk.onFinishCalls === 0 &&
    streamObjectResults.every(
      result =>
        result.callbackErrors.includes(providerErrorMessage) &&
        rejectedWith(result.stream, result.callbackErrorMessage) &&
        result.onFinishCalls === 0,
    );

  if (reproduced) {
    throw new Error(failureSignal);
  }

  throw new Error(
    'Unexpected issue #19161 reproduction outcome; see observations above.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
