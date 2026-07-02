import { ToolLoopAgent } from '../packages/ai/dist/index.js';
import { MockLanguageModelV4 } from '../packages/ai/dist/test/index.js';

type Outcome<T> =
  | { status: 'resolved'; value: T }
  | { status: 'rejected'; error: unknown }
  | { status: 'pending' };

async function settleWithin<T>(
  promise: Promise<T>,
  ms: number,
): Promise<Outcome<T>> {
  return Promise.race([
    promise.then(
      value => ({ status: 'resolved', value }) as const,
      error => ({ status: 'rejected', error }) as const,
    ),
    new Promise<Outcome<T>>(resolve =>
      setTimeout(() => resolve({ status: 'pending' }), ms),
    ),
  ]);
}

function describeOutcome(outcome: Outcome<unknown>) {
  if (outcome.status === 'resolved') {
    return `resolved (${JSON.stringify(outcome.value)})`;
  }

  if (outcome.status === 'rejected') {
    const error = outcome.error;
    return `rejected (${error instanceof Error ? error.name + ': ' + error.message : String(error)})`;
  }

  return 'pending';
}

const startedAt = Date.now();
const t = () => `${Date.now() - startedAt}ms`;

async function main() {
  const abortController = new AbortController();

  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
      abortSignal?.addEventListener(
        'abort',
        () => {
          console.log(
            `[${t()}] model received abortSignal, but the simulated provider body does not emit an error, finish chunk, or close`,
          );
        },
        { once: true },
      );

      return {
        stream: new ReadableStream({
          start(controller) {
            console.log(
              `[${t()}] simulated headers/body start: enqueue partial text, then leave stream open forever`,
            );
            controller.enqueue({
              type: 'response-metadata',
              id: 'msg-issue-15430',
              modelId: 'mock-model',
              timestamp: new Date(),
            });
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'partial response before abort',
            });

            // Important: no text-end, no finish, no close, and no error.
            // This deterministic harness reproduces the reported downstream
            // condition: the stream consumer is left waiting mid-flight, and the
            // user-provided abortSignal must be what unsticks result.text/steps.
          },
        }),
      };
    },
  });

  const agent = new ToolLoopAgent({
    model,
    instructions:
      'Emit a long response. The mock model will stop mid-stream without a finish chunk.',
  });

  const result = await agent.stream({
    prompt: 'Trigger a streaming response.',
    abortSignal: abortController.signal,
    onStepFinish: step => {
      console.log(`[${t()}] onStepFinish finishReason=${step.finishReason}`);
    },
  });

  setTimeout(() => {
    console.log(`[${t()}] aborting user-provided agent.stream abortSignal`);
    abortController.abort(
      new DOMException('issue-15430 watchdog abort', 'AbortError'),
    );
  }, 100);

  console.log(`[${t()}] awaiting result.text and result.steps`);

  const textOutcome = await settleWithin(result.text, 1_000);
  const stepsOutcome = await settleWithin(result.steps, 100);

  console.log(`[${t()}] result.text: ${describeOutcome(textOutcome)}`);
  console.log(`[${t()}] result.steps: ${describeOutcome(stepsOutcome)}`);

  if (textOutcome.status === 'pending' || stepsOutcome.status === 'pending') {
    console.error(
      `[${t()}] REPRODUCED issue #15430: result.text/result.steps remained pending after the abortSignal fired.`,
    );
    process.exit(1);
  }

  console.log(
    `[${t()}] Could not reproduce the hang: both promises settled after abort.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
