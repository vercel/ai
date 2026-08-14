import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { streamObject } from 'ai';
import { z } from 'zod';

const timeoutMs = 500;

type ErrorResultPromises = {
  object: Promise<unknown>;
  usage: Promise<unknown>;
  finishReason: Promise<unknown>;
  response: Promise<unknown>;
  warnings: Promise<unknown>;
};

function createModel(doStream: LanguageModelV4['doStream']): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'test.mock',
    modelId: 'mock',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('doGenerate is not used by this reproduction');
    },
    doStream,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function observePromise(
  promise: Promise<unknown>,
): Promise<
  | { status: 'resolved' }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' }
> {
  const settlement = promise
    .then(() => ({ status: 'resolved' }) as const)
    .catch(error => ({ status: 'rejected', error }) as const);

  const timeout = new Promise<{ status: 'timeout' }>(resolve => {
    setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });

  return Promise.race([settlement, timeout]);
}

async function expectResultPromisesToReject({
  scenario,
  result,
  errorMessage,
  failures,
}: {
  scenario: string;
  result: ErrorResultPromises;
  errorMessage: string;
  failures: string[];
}) {
  for (const name of [
    'object',
    'usage',
    'finishReason',
    'response',
    'warnings',
  ] as const) {
    const outcome = await observePromise(result[name]);

    if (outcome.status === 'timeout') {
      failures.push(`${scenario}: result.${name} remained pending`);
    } else if (outcome.status === 'resolved') {
      failures.push(
        `${scenario}: result.${name} resolved instead of rejecting`,
      );
    } else if (!getErrorMessage(outcome.error).includes(errorMessage)) {
      failures.push(
        `${scenario}: result.${name} rejected with an unrelated error: ${getErrorMessage(outcome.error)}`,
      );
    }
  }
}

async function consumeFullStream(result: {
  fullStream: AsyncIterable<unknown>;
}): Promise<unknown | undefined> {
  try {
    for await (const _part of result.fullStream) {
      // Consume the stream so provider parts and terminal stream errors run.
    }
    return undefined;
  } catch (error) {
    return error;
  }
}

async function verifyDoStreamThrow(failures: string[]) {
  const providerError = new Error('transient provider failure');
  const result = streamObject({
    model: createModel(async () => {
      throw providerError;
    }),
    schema: z.object({ content: z.string() }),
    prompt: 'hello',
    onError: () => {},
  });

  await consumeFullStream(result);
  await expectResultPromisesToReject({
    scenario: 'doStream throw',
    result,
    errorMessage: providerError.message,
    failures,
  });
}

async function verifyAbort(failures: string[]) {
  const abortError = new Error('user aborted streamObject');
  const abortController = new AbortController();
  abortController.abort(abortError);

  const result = streamObject({
    model: createModel(async options => {
      options.abortSignal?.throwIfAborted();
      throw new Error('expected the aborted signal to throw');
    }),
    schema: z.object({ content: z.string() }),
    prompt: 'hello',
    abortSignal: abortController.signal,
    onError: () => {},
  });

  await consumeFullStream(result);
  await expectResultPromisesToReject({
    scenario: 'abort',
    result,
    errorMessage: abortError.message,
    failures,
  });
}

async function verifyProviderErrorPart(failures: string[]) {
  const providerError = new Error('provider error part');
  const onErrorMessages: string[] = [];
  const onStepFinishReasons: string[] = [];
  const onFinishEvents: Array<{
    object: unknown;
    error: unknown;
    finishReason: string;
    usage: {
      inputTokens: number | undefined;
      outputTokens: number | undefined;
      totalTokens: number | undefined;
    };
  }> = [];

  const result = streamObject({
    model: createModel(async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'error', error: providerError });
          controller.close();
        },
      }),
    })),
    schema: z.object({ content: z.string() }),
    prompt: 'hello',
    onError: ({ error }) => {
      onErrorMessages.push(getErrorMessage(error));
    },
    onStepFinish: event => {
      onStepFinishReasons.push(event.finishReason);
    },
    onFinish: event => {
      onFinishEvents.push(event);
    },
  });

  const streamError = await consumeFullStream(result);

  if (streamError !== undefined) {
    failures.push(
      `provider error part: fullStream unexpectedly rejected: ${getErrorMessage(streamError)}`,
    );
  }

  if (
    !onErrorMessages.some(message => message.includes(providerError.message))
  ) {
    failures.push(
      'provider error part: onError did not receive the provider error',
    );
  }

  if (onStepFinishReasons.some(finishReason => finishReason !== 'error')) {
    failures.push(
      `provider error part: onStepFinish reported non-error finish reason ${onStepFinishReasons.join(', ')}`,
    );
  }

  if (
    onFinishEvents.some(
      event =>
        event.object === undefined &&
        (event.error === undefined || event.finishReason !== 'error'),
    )
  ) {
    const usage = onFinishEvents[0]?.usage;
    failures.push(
      `provider error part: onFinish reported success with undefined object and usage ${JSON.stringify(usage)}`,
    );
  }

  await expectResultPromisesToReject({
    scenario: 'provider error part',
    result,
    errorMessage: providerError.message,
    failures,
  });
}

async function verifyRejectedRawStream(failures: string[]) {
  const streamError = new Error('raw stream rejected');
  const onErrorMessages: string[] = [];

  const result = streamObject({
    model: createModel(async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.error(streamError);
        },
      }),
    })),
    schema: z.object({ content: z.string() }),
    prompt: 'hello',
    onError: ({ error }) => {
      onErrorMessages.push(getErrorMessage(error));
    },
  });

  const observedStreamError = await consumeFullStream(result);

  if (
    observedStreamError === undefined ||
    !getErrorMessage(observedStreamError).includes(streamError.message)
  ) {
    failures.push(
      'raw stream rejection: fullStream did not reject as expected',
    );
  }

  if (!onErrorMessages.some(message => message.includes(streamError.message))) {
    failures.push('raw stream rejection: onError was not called');
  }

  await expectResultPromisesToReject({
    scenario: 'raw stream rejection',
    result,
    errorMessage: streamError.message,
    failures,
  });
}

async function main() {
  const failures: string[] = [];

  await verifyDoStreamThrow(failures);
  await verifyAbort(failures);
  await verifyProviderErrorPart(failures);
  await verifyRejectedRawStream(failures);

  if (failures.length > 0) {
    console.error(`ISSUE_18930_REPRODUCED: ${failures.join(' | ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Issue #18930 is not reproduced.');
}

main().catch(error => {
  console.error('Reproduction harness failed unexpectedly:', error);
  process.exitCode = 2;
});
