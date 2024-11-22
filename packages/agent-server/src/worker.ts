import { DataStore } from './data-store';

export function createWorker({ dataStore }: { dataStore: DataStore }) {
  return async ({ runId }: { runId: string }) => {
    const runState = await dataStore.getRunState({ runId });

    // load module for state

    // execute module with context

    // wait for updated context

    // store updated context

    // submit next job

    console.log('TODO process job', runId);
  };
}
