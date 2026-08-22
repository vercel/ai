import {
  createUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
  type UIMessageStreamOnFinishCallback,
} from 'ai';

type Scenario =
  | 'successful-eof'
  | 'explicit-error-chunk'
  | 'execution-rejection'
  | 'merged-stream-rejection';

type LifecycleObservation = {
  callbackCount: number;
  chunkTypes: string[];
  finishReason: string | undefined;
  hasOutcome: boolean;
  isAborted: boolean;
  persistedOutcome: 'completed' | 'failed' | 'interrupted';
};

async function observeScenario(
  scenario: Scenario,
): Promise<LifecycleObservation> {
  const lifecycleEvents: Parameters<
    UIMessageStreamOnFinishCallback<UIMessage>
  >[0][] = [];
  const chunkTypes: string[] = [];

  const stream = createUIMessageStream({
    async execute({ writer }) {
      writer.write({ type: 'start' });
      writer.write({ type: 'text-start', id: 't1' });
      writer.write({
        type: 'text-delta',
        id: 't1',
        delta: 'partial output',
      });
      writer.write({ type: 'text-end', id: 't1' });

      switch (scenario) {
        case 'successful-eof':
          return;
        case 'explicit-error-chunk':
          writer.write({
            type: 'error',
            errorText: 'Internal server error',
          });
          return;
        case 'execution-rejection':
          throw new Error('execution rejected');
        case 'merged-stream-rejection':
          writer.merge(
            new ReadableStream<UIMessageChunk>({
              start(controller) {
                controller.error(new Error('merged stream rejected'));
              },
            }),
          );
      }
    },
    onError: () => 'An error occurred.',
    onFinish: event => {
      lifecycleEvents.push(event);
    },
    generateId: () => `${scenario}-message`,
  });

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunkTypes.push(value.type);
  }

  if (lifecycleEvents.length !== 1) {
    throw new Error(
      `${scenario}: expected onFinish exactly once, received ${lifecycleEvents.length}`,
    );
  }

  const event = lifecycleEvents[0];
  const persistedOutcome = event.isAborted
    ? 'interrupted'
    : event.finishReason === 'error'
      ? 'failed'
      : 'completed';

  return {
    callbackCount: lifecycleEvents.length,
    chunkTypes,
    finishReason: event.finishReason,
    hasOutcome: Object.hasOwn(event, 'outcome'),
    isAborted: event.isAborted,
    persistedOutcome,
  };
}

async function main() {
  const scenarios: Scenario[] = [
    'successful-eof',
    'explicit-error-chunk',
    'execution-rejection',
    'merged-stream-rejection',
  ];
  const observations = Object.fromEntries(
    await Promise.all(
      scenarios.map(async scenario => [
        scenario,
        await observeScenario(scenario),
      ]),
    ),
  ) as Record<Scenario, LifecycleObservation>;

  console.log(JSON.stringify(observations, null, 2));

  const success = observations['successful-eof'];
  const fatalFailures = [
    observations['execution-rejection'],
    observations['merged-stream-rejection'],
  ];
  const sameLifecycleDataAsSuccess = fatalFailures.every(
    observation =>
      observation.isAborted === success.isAborted &&
      observation.finishReason === success.finishReason &&
      observation.hasOutcome === success.hasOutcome,
  );
  const failureChunksWereEmitted = fatalFailures.every(observation =>
    observation.chunkTypes.includes('error'),
  );
  const failuresWerePersistedAsCompleted = fatalFailures.every(
    observation => observation.persistedOutcome === 'completed',
  );

  if (
    sameLifecycleDataAsSuccess &&
    failureChunksWereEmitted &&
    failuresWerePersistedAsCompleted &&
    !success.hasOutcome
  ) {
    console.error(
      'ISSUE_17500_REPRODUCED: execution and merged-stream failures are indistinguishable from successful EOF in the lifecycle callback and are persisted as completed',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue not reproduced: the lifecycle callback distinguished fatal failure from successful EOF.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
