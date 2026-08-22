import type {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { jsonSchema, streamObject, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { MockTracer } from '../../../../packages/ai/src/test/mock-tracer';

const providerErrorMessage = 'provider api failure';
const callbackErrorMessage = 'my rethrow';
const failureSignal =
  'ISSUE_19161_REPRODUCED: callback exceptions escaped and broke downstream completion';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
} satisfies LanguageModelV3Usage;

type Outcome<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; error: unknown };

class ReproductionFailure extends Error {
  constructor(readonly failures: string[]) {
    super(failureSignal);
  }
}

async function settle<T>(promise: PromiseLike<T>): Promise<Outcome<T>> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (error) {
    return { status: 'rejected', error };
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createTextErrorResult(callbacks: {
  onError: (event: { error: unknown }) => void;
  onFinish?: () => void;
  onStepFinish?: () => void;
  tracer?: MockTracer;
}) {
  const providerError = new Error(providerErrorMessage);

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'response-metadata',
            id: 'response-1',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'error', error: providerError },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'error', raw: 'error' },
            usage,
          },
        ] satisfies LanguageModelV3StreamPart[]),
      }),
    }),
    prompt: 'hi',
    onError: callbacks.onError,
    onFinish: callbacks.onFinish,
    onStepFinish: callbacks.onStepFinish,
    experimental_telemetry: callbacks.tracer
      ? { isEnabled: true, tracer: callbacks.tracer }
      : undefined,
  });

  return { providerError, result };
}

function createTextChunkResult(callbacks: {
  onChunk: () => void;
  onFinish?: () => void;
  onStepFinish?: () => void;
  tracer?: MockTracer;
}) {
  return streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'response-metadata',
            id: 'response-1',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ] satisfies LanguageModelV3StreamPart[]),
      }),
    }),
    prompt: 'hi',
    onChunk: callbacks.onChunk,
    onFinish: callbacks.onFinish,
    onStepFinish: callbacks.onStepFinish,
    experimental_telemetry: callbacks.tracer
      ? { isEnabled: true, tracer: callbacks.tracer }
      : undefined,
  });
}

const objectSchema = jsonSchema<{ content: string }>({
  type: 'object',
  properties: {
    content: { type: 'string' },
  },
  required: ['content'],
  additionalProperties: false,
});

function createObjectErrorResult(callbacks: {
  onError: (event: { error: unknown }) => void;
  onFinish?: () => void;
  tracer?: MockTracer;
}) {
  const providerError = new Error(providerErrorMessage);

  const result = streamObject({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'error', error: providerError },
        ]),
      }),
    }),
    schema: objectSchema,
    prompt: 'hi',
    onError: callbacks.onError,
    onFinish: callbacks.onFinish,
    experimental_telemetry: callbacks.tracer
      ? { isEnabled: true, tracer: callbacks.tracer }
      : undefined,
  });

  return { providerError, result };
}

function expectFulfilled<T>(
  failures: string[],
  label: string,
  outcome: Outcome<T>,
): outcome is { status: 'fulfilled'; value: T } {
  if (outcome.status === 'rejected') {
    failures.push(`${label} rejected with "${errorMessage(outcome.error)}"`);
    return false;
  }
  return true;
}

function expectRejectedWith(
  failures: string[],
  label: string,
  outcome: Outcome<unknown>,
  expectedError: Error,
) {
  if (outcome.status === 'fulfilled') {
    failures.push(`${label} unexpectedly fulfilled`);
  } else if (outcome.error !== expectedError) {
    failures.push(
      `${label} rejected with "${errorMessage(outcome.error)}" instead of "${expectedError.message}"`,
    );
  }
}

function expectRootSpanEnded(
  failures: string[],
  label: string,
  tracer: MockTracer,
  spanName: string,
) {
  const rootSpan = tracer.spans.find(span => span.name === spanName);
  if (rootSpan?.endCalls !== 1) {
    failures.push(
      `${label} telemetry root span ended ${rootSpan?.endCalls ?? 0} times`,
    );
  }
}

async function verifyStreamTextOnError(failures: string[]) {
  let onFinishCalled = false;
  let onStepFinishCalled = false;
  let callbackReceivedProviderError = false;
  const tracer = new MockTracer();
  const fullScenario = createTextErrorResult({
    onError: ({ error }) => {
      callbackReceivedProviderError =
        errorMessage(error) === providerErrorMessage;
      throw new Error(callbackErrorMessage);
    },
    onFinish: () => {
      onFinishCalled = true;
    },
    onStepFinish: () => {
      onStepFinishCalled = true;
    },
    tracer,
  });

  const stepsPromise = settle(fullScenario.result.steps);
  const finishReasonPromise = settle(fullScenario.result.finishReason);
  const fullStreamOutcome = await settle(
    collect(fullScenario.result.fullStream),
  );
  const stepsOutcome = await stepsPromise;
  const finishReasonOutcome = await finishReasonPromise;

  if (
    expectFulfilled(
      failures,
      'streamText.onError fullStream',
      fullStreamOutcome,
    )
  ) {
    const errorPart = fullStreamOutcome.value.find(
      part => part.type === 'error',
    );
    if (
      errorPart?.type !== 'error' ||
      errorPart.error !== fullScenario.providerError
    ) {
      failures.push(
        'streamText.onError fullStream did not preserve the provider error part',
      );
    }
  }
  if (expectFulfilled(failures, 'streamText.onError steps', stepsOutcome)) {
    if (stepsOutcome.value.length !== 1) {
      failures.push(
        'streamText.onError steps did not contain the completed step',
      );
    }
  }
  if (
    expectFulfilled(
      failures,
      'streamText.onError finishReason',
      finishReasonOutcome,
    ) &&
    finishReasonOutcome.value !== 'error'
  ) {
    failures.push(
      `streamText.onError finishReason was "${finishReasonOutcome.value}" instead of "error"`,
    );
  }
  if (!callbackReceivedProviderError) {
    failures.push('streamText.onError did not receive the provider error');
  }
  if (!onStepFinishCalled) {
    failures.push('streamText.onError prevented onStepFinish');
  }
  if (!onFinishCalled) {
    failures.push('streamText.onError prevented onFinish');
  }
  expectRootSpanEnded(failures, 'streamText.onError', tracer, 'ai.streamText');

  const textScenario = createTextErrorResult({
    onError: () => {
      throw new Error(callbackErrorMessage);
    },
  });
  const textStreamOutcome = await settle(
    collect(textScenario.result.textStream),
  );
  if (
    expectFulfilled(
      failures,
      'streamText.onError textStream',
      textStreamOutcome,
    ) &&
    textStreamOutcome.value.join('') !== 'Hello'
  ) {
    failures.push(
      `streamText.onError textStream produced "${textStreamOutcome.value.join('')}" instead of "Hello"`,
    );
  }
}

async function verifyStreamTextOnChunk(failures: string[]) {
  let onFinishCalled = false;
  let onStepFinishCalled = false;
  const tracer = new MockTracer();
  const result = createTextChunkResult({
    onChunk: () => {
      throw new Error(callbackErrorMessage);
    },
    onFinish: () => {
      onFinishCalled = true;
    },
    onStepFinish: () => {
      onStepFinishCalled = true;
    },
    tracer,
  });

  const stepsPromise = settle(result.steps);
  const finishReasonPromise = settle(result.finishReason);
  const fullStreamOutcome = await settle(collect(result.fullStream));
  const stepsOutcome = await stepsPromise;
  const finishReasonOutcome = await finishReasonPromise;

  if (
    expectFulfilled(
      failures,
      'streamText.onChunk fullStream',
      fullStreamOutcome,
    )
  ) {
    const text = fullStreamOutcome.value
      .filter(part => part.type === 'text-delta')
      .map(part => part.text)
      .join('');
    if (text !== 'Hello') {
      failures.push(
        `streamText.onChunk fullStream produced "${text}" instead of "Hello"`,
      );
    }
  }
  if (expectFulfilled(failures, 'streamText.onChunk steps', stepsOutcome)) {
    if (stepsOutcome.value.length !== 1) {
      failures.push(
        'streamText.onChunk steps did not contain the completed step',
      );
    }
  }
  if (
    expectFulfilled(
      failures,
      'streamText.onChunk finishReason',
      finishReasonOutcome,
    ) &&
    finishReasonOutcome.value !== 'stop'
  ) {
    failures.push(
      `streamText.onChunk finishReason was "${finishReasonOutcome.value}" instead of "stop"`,
    );
  }
  if (!onStepFinishCalled) {
    failures.push('streamText.onChunk prevented onStepFinish');
  }
  if (!onFinishCalled) {
    failures.push('streamText.onChunk prevented onFinish');
  }
  expectRootSpanEnded(failures, 'streamText.onChunk', tracer, 'ai.streamText');

  const textResult = createTextChunkResult({
    onChunk: () => {
      throw new Error(callbackErrorMessage);
    },
  });
  const textStreamOutcome = await settle(collect(textResult.textStream));
  if (
    expectFulfilled(
      failures,
      'streamText.onChunk textStream',
      textStreamOutcome,
    ) &&
    textStreamOutcome.value.join('') !== 'Hello'
  ) {
    failures.push(
      `streamText.onChunk textStream produced "${textStreamOutcome.value.join('')}" instead of "Hello"`,
    );
  }
}

async function verifyStreamObjectOnError(failures: string[]) {
  let onFinishCalled = false;
  let callbackReceivedProviderError = false;
  const tracer = new MockTracer();
  const fullScenario = createObjectErrorResult({
    onError: ({ error }) => {
      callbackReceivedProviderError =
        errorMessage(error) === providerErrorMessage;
      throw new Error(callbackErrorMessage);
    },
    onFinish: () => {
      onFinishCalled = true;
    },
    tracer,
  });

  const objectPromise = settle(fullScenario.result.object);
  const finishReasonPromise = settle(fullScenario.result.finishReason);
  const fullStreamOutcome = await settle(
    collect(fullScenario.result.fullStream),
  );
  const objectOutcome = await objectPromise;
  const finishReasonOutcome = await finishReasonPromise;

  if (
    expectFulfilled(
      failures,
      'streamObject.onError fullStream',
      fullStreamOutcome,
    )
  ) {
    const errorPart = fullStreamOutcome.value.find(
      part => part.type === 'error',
    );
    if (
      errorPart?.type !== 'error' ||
      errorPart.error !== fullScenario.providerError
    ) {
      failures.push(
        'streamObject.onError fullStream did not preserve the provider error part',
      );
    }
  }
  expectRejectedWith(
    failures,
    'streamObject.onError object',
    objectOutcome,
    fullScenario.providerError,
  );
  expectRejectedWith(
    failures,
    'streamObject.onError finishReason',
    finishReasonOutcome,
    fullScenario.providerError,
  );
  if (!callbackReceivedProviderError) {
    failures.push('streamObject.onError did not receive the provider error');
  }
  if (!onFinishCalled) {
    failures.push('streamObject.onError prevented onFinish');
  }
  expectRootSpanEnded(
    failures,
    'streamObject.onError',
    tracer,
    'ai.streamObject',
  );

  for (const streamName of ['partialObjectStream', 'textStream'] as const) {
    const scenario = createObjectErrorResult({
      onError: () => {
        throw new Error(callbackErrorMessage);
      },
    });
    const streamOutcome = await settle(
      collect(scenario.result[streamName] as AsyncIterable<unknown>),
    );
    if (
      expectFulfilled(
        failures,
        `streamObject.onError ${streamName}`,
        streamOutcome,
      ) &&
      streamOutcome.value.length !== 0
    ) {
      failures.push(
        `streamObject.onError ${streamName} produced unexpected values`,
      );
    }
  }
}

async function main() {
  const failures: string[] = [];

  await verifyStreamTextOnError(failures);
  await verifyStreamTextOnChunk(failures);
  await verifyStreamObjectOnError(failures);

  if (failures.length > 0) {
    throw new ReproductionFailure(failures);
  }

  console.log('Issue #19161 behavior was not observed.');
}

main().catch(error => {
  if (error instanceof ReproductionFailure) {
    console.error(failureSignal);
    for (const failure of error.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  throw error;
});
