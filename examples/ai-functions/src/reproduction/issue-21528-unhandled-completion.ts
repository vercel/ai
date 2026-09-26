import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type Scenario = 'stop' | 'stall timeout' | 'provider error';

async function main() {
  const nodeProcess = process;
  const originalRelease = nodeProcess.release;
  const activeScenario = { current: undefined as Scenario | undefined };
  const unhandledRejections: Array<{ scenario: Scenario; reason: unknown }> =
    [];

  const onUnhandledRejection = (reason: unknown) => {
    if (activeScenario.current != null) {
      unhandledRejections.push({
        scenario: activeScenario.current,
        reason,
      });
    }
  };

  nodeProcess.on('unhandledRejection', onUnhandledRejection);

  try {
    Object.defineProperty(nodeProcess, 'release', {
      configurable: true,
      enumerable: true,
      value: { ...originalRelease, name: 'react-native' },
    });

    activeScenario.current = 'stop';
    await reproduceStop();
    await waitForUnhandledRejection();

    activeScenario.current = 'stall timeout';
    await reproduceStallTimeout();
    await waitForUnhandledRejection();

    activeScenario.current = 'provider error';
    await reproduceProviderError();
    await waitForUnhandledRejection();
  } finally {
    activeScenario.current = undefined;
    Object.defineProperty(nodeProcess, 'release', {
      configurable: true,
      enumerable: true,
      value: originalRelease,
    });
    nodeProcess.off('unhandledRejection', onUnhandledRejection);
  }

  const expectedUnhandledRejections: Record<Scenario, string> = {
    stop: 'AbortError',
    'stall timeout': 'TimeoutError',
    'provider error': 'Error',
  };

  const reproducedScenarios = (
    Object.entries(expectedUnhandledRejections) as Array<[Scenario, string]>
  ).filter(([scenario, expectedName]) =>
    unhandledRejections.some(
      unhandled =>
        unhandled.scenario === scenario &&
        unhandled.reason instanceof Error &&
        unhandled.reason.name === expectedName,
    ),
  );

  if (reproducedScenarios.length > 0) {
    throw new Error(
      `ISSUE_21528_REPRODUCED: streamText emitted unhandled completion rejections in a non-Node runtime for ${reproducedScenarios
        .map(([scenario]) => scenario)
        .join(', ')}`,
    );
  }

  if (unhandledRejections.length > 0) {
    throw new Error(
      `Unexpected unhandled rejection: ${String(unhandledRejections[0].reason)}`,
    );
  }
}

async function reproduceStop() {
  let resolveStreamStarted: () => void;
  const streamStarted = new Promise<void>(resolve => {
    resolveStreamStarted = resolve;
  });
  const abortController = new AbortController();
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'partial response',
            });
            resolveStreamStarted();

            abortSignal?.addEventListener(
              'abort',
              () => controller.error(abortSignal.reason),
              { once: true },
            );
          },
        }),
      }),
    }),
    prompt: 'Write a response that will be stopped.',
    abortSignal: abortController.signal,
    onError: () => {},
  });

  const consumePromise = result.consumeStream({ onError: () => {} });
  await streamStarted;
  abortController.abort();
  await consumePromise;
}

async function reproduceStallTimeout() {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            abortSignal?.addEventListener(
              'abort',
              () => controller.error(abortSignal.reason),
              { once: true },
            );
          },
        }),
      }),
    }),
    prompt: 'Wait indefinitely without producing a first chunk.',
    timeout: { firstChunkMs: 10 },
    onError: () => {},
  });

  await result.consumeStream({ onError: () => {} });
}

async function reproduceProviderError() {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.error(new Error('simulated provider stream error'));
          },
        }),
      }),
    }),
    prompt: 'Fail before completing a step.',
    onError: () => {},
  });

  await result.consumeStream({ onError: () => {} });
}

async function waitForUnhandledRejection() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
