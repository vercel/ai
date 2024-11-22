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

    const stateModule = await moduleLoader.loadState({
      agent: runState.agent,
      state: runState.state,
    });
    const {
      context,
      stream,
      nextState: nextStatePromise,
    } = await stateModule.execute({
      context: runState.context,
    });

    const nextState = await nextStatePromise;
    const [newStream, original] = stream.tee();

    streamManager.addToStream(runId, original);

    // consume stream without backpressure and store it
    // to enable multiple consumers and re-consumption
    const reader = newStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      // store append to stream file on disk
      //   process.stdout.write(JSON.stringify(value));
    }

    // wait for updated context. if undefined, we use the old context
    const updatedContext =
      context === undefined ? runState.context : await context;

    // calculate next state
    const agentModule = await moduleLoader.loadAgent({
      agent: runState.agent,
    });

    // store updated context
    await dataStore.updateRun({
      runId,
      agent: runState.agent,
      createdAt: runState.createdAt,
      state: nextState,
      context: updatedContext,
    });

    // submit next job or end
    if (nextState === 'END') {
      streamManager.closeStream(runId);
    } else {
      submitJob({ runId });
    }
  };
}
