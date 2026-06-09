import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { streamText } from '../src/generate-text/stream-text';

// Usage:
//   pnpm --filter ai exec tsx scripts/repro-incomplete-provider-stream.ts
//
// This simulates provider streams that emit only response metadata before either
// closing or erroring. The first scenario reproduces a terminal empty step:
// finishReason "other", empty content, empty response.messages, and empty text.

type Scenario = 'metadata-only-close' | 'metadata-then-error';

type StepSummary = {
  content: unknown;
  finishReason: string;
  responseMessages: unknown;
  usage: unknown;
};

type TimedResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }
  | { status: 'timed-out' };

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }

  return error;
}

async function settleWithin<T>(
  promise: PromiseLike<T>,
  timeoutMs = 250,
): Promise<TimedResult<T>> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<TimedResult<T>>(resolve => {
    timeout = setTimeout(() => resolve({ status: 'timed-out' }), timeoutMs);
  });

  const settledPromise = Promise.resolve(promise).then<
    TimedResult<T>,
    TimedResult<T>
  >(
    value => ({ status: 'fulfilled', value }),
    error => ({ status: 'rejected', reason: serializeError(error) }),
  );

  try {
    return await Promise.race([settledPromise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createIncompleteProviderStream(
  scenario: Scenario,
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({
        type: 'response-metadata',
        id: 'provider-response-id',
        modelId: 'provider-model-id',
        timestamp: new Date(0),
      });

      if (scenario === 'metadata-then-error') {
        controller.error(new Error('simulated upstream stream termination'));
        return;
      }

      // No text/reasoning/tool content and no finish chunk. This is the shape
      // that reproduces an empty terminal step with finishReason "other".
      controller.close();
    },
  });
}

function createModel(scenario: Scenario): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'repro-provider',
    modelId: `repro-${scenario}`,
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('doGenerate is not used in this repro');
    },
    doStream: async (_options: LanguageModelV4CallOptions) => ({
      stream: createIncompleteProviderStream(scenario),
      request: { body: JSON.stringify({ scenario }) },
      response: { headers: { 'x-repro-scenario': scenario } },
      warnings: [],
    }),
  };
}

async function runScenario(scenario: Scenario) {
  const abortController = new AbortController();
  const stepSummaries: StepSummary[] = [];
  const onErrorCalls: string[] = [];

  const result = streamText({
    abortSignal: abortController.signal,
    model: createModel(scenario),
    prompt: 'hello',
    onError: ({ error }) => {
      onErrorCalls.push(error instanceof Error ? error.message : String(error));
    },
    onStepFinish: step => {
      stepSummaries.push({
        content: step.content,
        finishReason: step.finishReason,
        responseMessages: step.response.messages,
        usage: step.usage,
      });
    },
  });

  const consumeStream = await settleWithin(result.consumeStream());
  if (consumeStream.status === 'timed-out') {
    abortController.abort('repro timed out waiting for stream to settle');
  }

  const [finishReason, text, steps, totalUsage] = await Promise.all([
    settleWithin(result.finishReason),
    settleWithin(result.text),
    settleWithin(result.steps),
    settleWithin(result.totalUsage),
  ]);

  return {
    consumeStream,
    finishReason,
    onErrorCalls,
    scenario,
    steps,
    stepSummaries,
    text,
    totalUsage,
  };
}

async function main() {
  for (const scenario of [
    'metadata-only-close',
    'metadata-then-error',
  ] as const) {
    console.log(JSON.stringify(await runScenario(scenario), null, 2));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
