import { streamObject, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

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
};

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) {
    values.push(value);
  }
  return values;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expect(condition: boolean, message: string, failures: string[]): void {
  if (!condition) {
    failures.push(message);
  }
}

function createTextModel({
  providerError,
}: {
  providerError?: Error;
} = {}) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'response-id',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          });
          controller.enqueue({ type: 'text-start', id: 'text-id' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-id',
            delta: 'Hello',
          });
          if (providerError != null) {
            controller.enqueue({ type: 'error', error: providerError });
          }
          controller.enqueue({ type: 'text-end', id: 'text-id' });
          controller.enqueue({
            type: 'finish',
            finishReason: {
              unified: providerError == null ? 'stop' : 'error',
              raw: providerError == null ? 'stop' : 'error',
            },
            usage,
          });
          controller.close();
        },
      }) as any,
    }),
  });
}

async function verifyStreamTextOnError(failures: string[]): Promise<void> {
  const providerError = new Error('provider api failure');
  const callbackError = new Error('streamText onError callback failure');
  let onErrorValue: unknown;
  let onFinishCount = 0;
  let onStepFinishCount = 0;
  let telemetryEndCount = 0;

  const result = streamText({
    model: createTextModel({ providerError }),
    prompt: 'hi',
    onError({ error }) {
      onErrorValue = error;
      throw callbackError;
    },
    onFinish() {
      onFinishCount++;
    },
    onStepFinish() {
      onStepFinishCount++;
    },
    telemetry: {
      integrations: {
        onEnd() {
          telemetryEndCount++;
        },
      },
    },
  });

  const [fullStream, textStream, steps, finishReason] =
    await Promise.allSettled([
      collect(result.fullStream),
      collect(result.textStream),
      result.steps,
      result.finishReason,
    ]);

  expect(
    onErrorValue === providerError,
    'streamText onError did not receive the original provider error',
    failures,
  );
  expect(
    fullStream.status === 'fulfilled',
    `streamText fullStream rejected with "${errorMessage(
      fullStream.status === 'rejected' ? fullStream.reason : undefined,
    )}"`,
    failures,
  );
  if (fullStream.status === 'fulfilled') {
    expect(
      fullStream.value.some(
        part => part.type === 'error' && part.error === providerError,
      ),
      'streamText fullStream did not preserve the original provider error part',
      failures,
    );
  }
  expect(
    textStream.status === 'fulfilled',
    `streamText textStream rejected with "${errorMessage(
      textStream.status === 'rejected' ? textStream.reason : undefined,
    )}"`,
    failures,
  );
  if (textStream.status === 'fulfilled') {
    expect(
      textStream.value.join('') === 'Hello',
      'streamText textStream did not preserve the generated text',
      failures,
    );
  }
  expect(
    steps.status === 'fulfilled' && steps.value.length === 1,
    `streamText steps rejected with "${errorMessage(
      steps.status === 'rejected' ? steps.reason : undefined,
    )}"`,
    failures,
  );
  expect(
    finishReason.status === 'fulfilled' && finishReason.value === 'error',
    `streamText finishReason rejected with "${errorMessage(
      finishReason.status === 'rejected' ? finishReason.reason : undefined,
    )}"`,
    failures,
  );
  expect(
    onStepFinishCount === 1,
    `streamText onStepFinish fired ${onStepFinishCount} times instead of once`,
    failures,
  );
  expect(
    onFinishCount === 1,
    `streamText onFinish fired ${onFinishCount} times instead of once`,
    failures,
  );
  expect(
    telemetryEndCount === 1,
    `streamText telemetry onEnd fired ${telemetryEndCount} times instead of once`,
    failures,
  );
}

async function verifyStreamTextOnChunk(failures: string[]): Promise<void> {
  const callbackError = new Error('streamText onChunk callback failure');
  let onFinishCount = 0;
  let onStepFinishCount = 0;
  let telemetryEndCount = 0;

  const result = streamText({
    model: createTextModel(),
    prompt: 'hi',
    onChunk({ chunk }) {
      if (chunk.type === 'text-delta') {
        throw callbackError;
      }
    },
    onFinish() {
      onFinishCount++;
    },
    onStepFinish() {
      onStepFinishCount++;
    },
    telemetry: {
      integrations: {
        onEnd() {
          telemetryEndCount++;
        },
      },
    },
  });

  const [fullStream, textStream, steps, finishReason] =
    await Promise.allSettled([
      collect(result.fullStream),
      collect(result.textStream),
      result.steps,
      result.finishReason,
    ]);

  expect(
    fullStream.status === 'fulfilled',
    `streamText fullStream rejected after onChunk threw: "${errorMessage(
      fullStream.status === 'rejected' ? fullStream.reason : undefined,
    )}"`,
    failures,
  );
  expect(
    textStream.status === 'fulfilled',
    `streamText textStream rejected after onChunk threw: "${errorMessage(
      textStream.status === 'rejected' ? textStream.reason : undefined,
    )}"`,
    failures,
  );
  if (textStream.status === 'fulfilled') {
    expect(
      textStream.value.join('') === 'Hello',
      'streamText textStream did not preserve text after onChunk threw',
      failures,
    );
  }
  expect(
    steps.status === 'fulfilled' && steps.value.length === 1,
    `streamText steps rejected after onChunk threw: "${errorMessage(
      steps.status === 'rejected' ? steps.reason : undefined,
    )}"`,
    failures,
  );
  expect(
    finishReason.status === 'fulfilled' && finishReason.value === 'stop',
    `streamText finishReason rejected after onChunk threw: "${errorMessage(
      finishReason.status === 'rejected' ? finishReason.reason : undefined,
    )}"`,
    failures,
  );
  expect(
    onStepFinishCount === 1,
    `streamText onStepFinish fired ${onStepFinishCount} times after onChunk threw`,
    failures,
  );
  expect(
    onFinishCount === 1,
    `streamText onFinish fired ${onFinishCount} times after onChunk threw`,
    failures,
  );
  expect(
    telemetryEndCount === 1,
    `streamText telemetry onEnd fired ${telemetryEndCount} times after onChunk threw`,
    failures,
  );
}

type ObjectConsumer = 'fullStream' | 'partialObjectStream' | 'textStream';

async function verifyStreamObjectOnError(
  consumer: ObjectConsumer,
  failures: string[],
): Promise<void> {
  const providerError = new Error(
    `streamObject provider failure for ${consumer}`,
  );
  const callbackError = new Error(
    `streamObject onError callback failure for ${consumer}`,
  );
  let onErrorValue: unknown;
  let onFinishCount = 0;
  let onStepFinishCount = 0;
  let telemetryEndCount = 0;

  const result = streamObject({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'error', error: providerError });
            controller.close();
          },
        }) as any,
      }),
    }),
    schema: z.object({ content: z.string() }),
    prompt: 'hi',
    onError({ error }) {
      onErrorValue = error;
      throw callbackError;
    },
    onFinish() {
      onFinishCount++;
    },
    onStepFinish() {
      onStepFinishCount++;
    },
    telemetry: {
      integrations: {
        onEnd() {
          telemetryEndCount++;
        },
      },
    },
  });

  const streamPromise =
    consumer === 'fullStream'
      ? collect(result.fullStream)
      : consumer === 'partialObjectStream'
        ? collect(result.partialObjectStream)
        : collect(result.textStream);

  const [streamResult, finishReason] = await Promise.allSettled([
    streamPromise,
    result.finishReason,
  ]);

  expect(
    onErrorValue === providerError,
    `streamObject ${consumer} onError did not receive the original provider error`,
    failures,
  );
  expect(
    streamResult.status === 'fulfilled',
    `streamObject ${consumer} rejected with "${errorMessage(
      streamResult.status === 'rejected' ? streamResult.reason : undefined,
    )}"`,
    failures,
  );
  if (consumer === 'fullStream' && streamResult.status === 'fulfilled') {
    expect(
      streamResult.value.some(
        part =>
          typeof part === 'object' &&
          part != null &&
          'type' in part &&
          part.type === 'error' &&
          'error' in part &&
          part.error === providerError,
      ),
      'streamObject fullStream did not preserve the original provider error part',
      failures,
    );
  }
  expect(
    finishReason.status === 'rejected' && finishReason.reason === providerError,
    `streamObject ${consumer} result promise did not preserve the original provider error`,
    failures,
  );
  expect(
    onStepFinishCount === 1,
    `streamObject ${consumer} onStepFinish fired ${onStepFinishCount} times instead of once`,
    failures,
  );
  expect(
    onFinishCount === 1,
    `streamObject ${consumer} onFinish fired ${onFinishCount} times instead of once`,
    failures,
  );
  expect(
    telemetryEndCount === 1,
    `streamObject ${consumer} telemetry onEnd fired ${telemetryEndCount} times instead of once`,
    failures,
  );
}

async function main(): Promise<void> {
  const failures: string[] = [];

  await verifyStreamTextOnError(failures);
  await verifyStreamTextOnChunk(failures);
  await verifyStreamObjectOnError('fullStream', failures);
  await verifyStreamObjectOnError('partialObjectStream', failures);
  await verifyStreamObjectOnError('textStream', failures);

  if (failures.length > 0) {
    console.error(
      'ISSUE #19161 REPRODUCED: callback exceptions escaped stream lifecycle isolation',
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Issue #19161 is not present.');
}

main().catch(error => {
  console.error('Reproduction harness failed unexpectedly:', error);
  process.exitCode = 2;
});
