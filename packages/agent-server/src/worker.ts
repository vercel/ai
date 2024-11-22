import { JSONValue } from '@ai-sdk/provider';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { StreamManager } from './stream-manager';
import pino from 'pino';

export function createWorker({
  dataStore,
  moduleLoader,
  streamManager,
  submitJob,
  logger,
}: {
  dataStore: DataStore;
  moduleLoader: ModuleLoader;
  streamManager: StreamManager;
  submitJob: (job: { runId: string }) => Promise<void>;
  logger: pino.Logger;
}) {
  return async ({ runId }: { runId: string }) => {
    const runState = await dataStore.getRunState({ runId });

    logger.info(`state ${runState.state} executing in ${runId}`);

    const streams: Set<ReadableStream<JSONValue>> = new Set();

    const stateModule = await moduleLoader.loadState({
      agent: runState.agent,
      state: runState.state,
    });
    const { context, nextState: nextStatePromise } = await stateModule.execute({
      context: runState.context,
      forwardStream: stream => {
        const [newStream, original] = stream.tee();
        streams.add(newStream);
        streamManager.addToStream(runId, original); // immediately forward to client
      },
    });

    const nextState = await nextStatePromise;

    // consume all streams without backpressure and store it
    // to enable multiple consumers and re-consumption
    for (const stream of streams) {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // store append to stream file on disk
        //   process.stdout.write(JSON.stringify(value));
      }
    }

    // wait for updated context. if undefined, we use the old context
    const updatedContext =
      context === undefined ? runState.context : await context;

    // store updated context
    await dataStore.updateRun({
      runId,
      agent: runState.agent,
      createdAt: runState.createdAt,
      state: nextState,
      context: updatedContext,
      step: runState.step + 1,
    });

    // submit next job or end
    if (nextState === 'END') {
      streamManager.closeStream(runId);
      logger.info(`run ${runId} ended`);
    } else {
      submitJob({ runId });
      logger.info(`run ${runId} submitted job for ${nextState}`);
    }
  };
}
