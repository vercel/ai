import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { StreamManager } from './stream-manager';

export function createWorker({
  dataStore,
  moduleLoader,
  streamManager,
}: {
  dataStore: DataStore;
  moduleLoader: ModuleLoader;
  streamManager: StreamManager;
}) {
  return async ({ runId }: { runId: string }) => {
    const runState = await dataStore.getRunState({ runId });
    const stateModule = await moduleLoader.loadState({
      agent: runState.agent,
      state: runState.state,
    });
    const { context, stream } = await stateModule.execute({
      context: runState.context,
    });

    streamManager.addToStream(runId, stream);

    // wait for stream to finish

    // wait for updated context

    // calculate next state

    // store updated context

    // submit next job
  };
}
