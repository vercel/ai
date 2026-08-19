import { streamObject } from '../../../../packages/ai/src/index';
import { z } from '../../../../packages/ai/node_modules/zod/v4';

const resultPromiseNames = [
  'object',
  'usage',
  'finishReason',
  'response',
  'warnings',
] as const;

type ResultPromiseName = (typeof resultPromiseNames)[number];

type PromiseOutcome =
  | { state: 'fulfilled' }
  | { state: 'rejected'; error: unknown }
  | { state: 'pending' };

type ScenarioResult = {
  name: string;
  expectedError: Error;
  outcomes: Record<ResultPromiseName, PromiseOutcome>;
  onErrorErrors: unknown[];
  onFinishEvents: Array<{
    object: unknown;
    error: unknown;
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    } | null;
  }>;
  fullStreamError?: unknown;
};

function createModel(
  doStream: (options: { abortSignal?: AbortSignal }) => Promise<{
    stream: ReadableStream<unknown>;
  }>,
) {
  return {
    specificationVersion: 'v2',
    provider: 'test.mock',
    modelId: 'mock',
    supportedUrls: {},
    doStream,
  } as any;
}

function streamFromParts(parts: unknown[]): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

async function observePromise(
  promise: Promise<unknown>,
  timeoutMs = 250,
): Promise<PromiseOutcome> {
  return Promise.race([
    promise.then(
      () => ({ state: 'fulfilled' }) as const,
      error => ({ state: 'rejected', error }) as const,
    ),
    new Promise<{ state: 'pending' }>(resolve =>
      setTimeout(() => resolve({ state: 'pending' }), timeoutMs),
    ),
  ]);
}

function errorMatches(actual: unknown, expected: Error): boolean {
  return (
    actual === expected ||
    (actual instanceof Error && actual.message.includes(expected.message))
  );
}

async function runScenario({
  name,
  expectedError,
  model,
  abortSignal,
}: {
  name: string;
  expectedError: Error;
  model: any;
  abortSignal?: AbortSignal;
}): Promise<ScenarioResult> {
  const onErrorErrors: unknown[] = [];
  const onFinishEvents: ScenarioResult['onFinishEvents'] = [];

  const result = streamObject({
    model,
    maxRetries: 0,
    abortSignal,
    schema: z.object({ content: z.string() }),
    prompt: 'hello',
    onError({ error }) {
      onErrorErrors.push(error);
    },
    onFinish({ object, error, usage }) {
      onFinishEvents.push({ object, error, usage });
    },
  });

  const outcomeEntries = resultPromiseNames.map(
    async name => [name, await observePromise(result[name])] as const,
  );

  let fullStreamError: unknown;
  try {
    for await (const _part of result.fullStream) {
      // Consume the stream so all callbacks and terminal stream behavior run.
    }
  } catch (error) {
    fullStreamError = error;
  }

  return {
    name,
    expectedError,
    outcomes: Object.fromEntries(await Promise.all(outcomeEntries)) as Record<
      ResultPromiseName,
      PromiseOutcome
    >,
    onErrorErrors,
    onFinishEvents,
    fullStreamError,
  };
}

function formatOutcome(outcome: PromiseOutcome): string {
  if (outcome.state !== 'rejected') {
    return outcome.state;
  }

  return outcome.error instanceof Error
    ? `rejected: ${outcome.error.message}`
    : `rejected: ${String(outcome.error)}`;
}

function formatUsage(
  usage: ScenarioResult['onFinishEvents'][number]['usage'],
): string {
  return usage == null
    ? String(usage)
    : `{ inputTokens: ${String(usage.inputTokens)}, outputTokens: ${String(
        usage.outputTokens,
      )}, totalTokens: ${String(usage.totalTokens)} }`;
}

async function main() {
  const setupError = new Error('transient provider failure');
  const setupScenario = await runScenario({
    name: 'doStream throws',
    expectedError: setupError,
    model: createModel(async () => {
      throw setupError;
    }),
  });

  const abortError = new Error('request aborted');
  const abortController = new AbortController();
  const abortScenarioPromise = runScenario({
    name: 'request abort makes doStream throw',
    expectedError: abortError,
    abortSignal: abortController.signal,
    model: createModel(async ({ abortSignal }) => {
      if (abortSignal?.aborted) {
        throw abortSignal.reason;
      }

      return await new Promise((_, reject) => {
        abortSignal?.addEventListener(
          'abort',
          () => reject(abortSignal.reason),
          { once: true },
        );
      });
    }),
  });
  abortController.abort(abortError);
  const abortScenario = await abortScenarioPromise;

  const providerPartError = new Error('provider error part');
  const providerPartScenario = await runScenario({
    name: 'provider error part followed by normal close',
    expectedError: providerPartError,
    model: createModel(async () => ({
      stream: streamFromParts([
        { type: 'stream-start', warnings: [] },
        { type: 'error', error: providerPartError },
      ]),
    })),
  });

  const rawStreamError = new Error('raw stream rejected');
  const rawStreamScenario = await runScenario({
    name: 'raw provider stream rejects',
    expectedError: rawStreamError,
    model: createModel(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.error(rawStreamError);
        },
      }),
    })),
  });

  const scenarios = [
    setupScenario,
    abortScenario,
    providerPartScenario,
    rawStreamScenario,
  ];

  const pendingPromises: string[] = [];
  const assertionFailures: string[] = [];

  for (const scenario of scenarios) {
    for (const promiseName of resultPromiseNames) {
      const outcome = scenario.outcomes[promiseName];

      if (outcome.state === 'pending') {
        pendingPromises.push(`${scenario.name}: result.${promiseName}`);
      } else if (
        outcome.state !== 'rejected' ||
        !errorMatches(outcome.error, scenario.expectedError)
      ) {
        assertionFailures.push(
          `${scenario.name}: result.${promiseName} was ${formatOutcome(outcome)}`,
        );
      }
    }
  }

  for (const scenario of [setupScenario, abortScenario, providerPartScenario]) {
    if (
      !scenario.onErrorErrors.some(error =>
        errorMatches(error, scenario.expectedError),
      )
    ) {
      assertionFailures.push(
        `${scenario.name}: onError did not receive the failure`,
      );
    }
  }

  if (!errorMatches(rawStreamScenario.fullStreamError, rawStreamError)) {
    assertionFailures.push(
      'raw provider stream rejects: fullStream did not expose the failure',
    );
  }

  if (
    !rawStreamScenario.onErrorErrors.some(error =>
      errorMatches(error, rawStreamError),
    )
  ) {
    assertionFailures.push(
      'raw provider stream rejects: onError did not receive the failure',
    );
  }

  for (const event of providerPartScenario.onFinishEvents) {
    if (!errorMatches(event.error, providerPartError)) {
      assertionFailures.push(
        `provider error part followed by normal close: onFinish reported no failure (object: ${String(
          event.object,
        )}, error: ${String(event.error)}, usage: ${formatUsage(event.usage)})`,
      );
    }

    if (
      event.usage != null &&
      [
        event.usage.inputTokens,
        event.usage.outputTokens,
        event.usage.totalTokens,
      ]
        .filter((value): value is number => value !== undefined)
        .some(Number.isNaN)
    ) {
      assertionFailures.push(
        'provider error part followed by normal close: onFinish reported NaN usage',
      );
    }
  }

  if (pendingPromises.length > 0) {
    console.error(
      'ISSUE #18930 REPRODUCED: streamObject failure result promises stayed pending',
    );
    console.error(`Pending promises:\n- ${pendingPromises.join('\n- ')}`);
  }

  if (assertionFailures.length > 0) {
    console.error(`Additional failures:\n- ${assertionFailures.join('\n- ')}`);
  }

  if (pendingPromises.length > 0 || assertionFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('All streamObject failure paths settled and reported errors.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
