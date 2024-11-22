import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';

export function createWorker({
  dataStore,
  moduleLoader,
}: {
  dataStore: DataStore;
  moduleLoader: ModuleLoader;
}) {
  return async ({ runId }: { runId: string }) => {
    const runState = await dataStore.getRunState({ runId });
    const stateModule = await moduleLoader.loadState({
      agent: runState.agent,
      state: runState.state,
    });

    // execute module with context

    // wait for updated context

    // store updated context

    // submit next job

    console.log('TODO process job', runId);
  };
}
