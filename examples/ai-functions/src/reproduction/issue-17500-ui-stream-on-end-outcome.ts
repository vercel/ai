import { createUIMessageStream } from 'ai';

type CaseName =
  | 'successful-eof'
  | 'terminal-error-chunk'
  | 'execute-rejection'
  | 'merged-stream-rejection';

type Observation = {
  caseName: CaseName;
  chunkTypes: string[];
  onEndCalls: number;
  lifecycle: {
    isAborted: boolean;
    finishReason: unknown;
    outcome: unknown;
  };
  persistedOutcome: 'completed' | 'failed' | 'interrupted';
};

async function observe(caseName: CaseName): Promise<Observation> {
  let onEndCalls = 0;
  let lifecycle: Observation['lifecycle'] | undefined;

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

      if (caseName === 'terminal-error-chunk') {
        writer.write({
          type: 'error',
          errorText: 'Internal server error',
        });
      }

      if (caseName === 'execute-rejection') {
        throw new Error('fatal execute failure');
      }

      if (caseName === 'merged-stream-rejection') {
        writer.merge(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('fatal merged stream failure'));
            },
          }),
        );
      }
    },
    onError: error =>
      error instanceof Error ? error.message : 'unknown stream error',
    onEnd: event => {
      onEndCalls++;
      const eventRecord = event as unknown as Record<string, unknown>;
      lifecycle = {
        isAborted: event.isAborted,
        finishReason: event.finishReason,
        outcome: eventRecord.outcome,
      };
    },
    generateId: () => 'response-message-id',
  });

  const chunkTypes: string[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) {
      break;
    }
    chunkTypes.push(chunk.type);
  }

  if (lifecycle == null) {
    throw new Error(`onEnd was not called for ${caseName}`);
  }

  const persistedOutcome = lifecycle.isAborted
    ? 'interrupted'
    : lifecycle.finishReason === 'error'
      ? 'failed'
      : 'completed';

  return {
    caseName,
    chunkTypes,
    onEndCalls,
    lifecycle,
    persistedOutcome,
  };
}

async function main() {
  const observations = await Promise.all([
    observe('successful-eof'),
    observe('terminal-error-chunk'),
    observe('execute-rejection'),
    observe('merged-stream-rejection'),
  ]);

  console.log(JSON.stringify(observations, null, 2));

  const [successful, terminalError, executeRejection, mergedRejection] =
    observations;
  const successfulLifecycle = JSON.stringify(successful.lifecycle);

  const failuresAreIndistinguishable = [
    terminalError,
    executeRejection,
    mergedRejection,
  ].every(
    observation =>
      observation.chunkTypes.includes('error') &&
      observation.onEndCalls === 1 &&
      observation.persistedOutcome === 'completed' &&
      JSON.stringify(observation.lifecycle) === successfulLifecycle,
  );

  if (failuresAreIndistinguishable) {
    throw new Error(
      'ISSUE_17500_REPRODUCED: failed and successful UI streams have indistinguishable onEnd lifecycle payloads',
    );
  }

  console.log(
    'Issue not reproduced: onEnd exposed a distinguishable failure outcome.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
