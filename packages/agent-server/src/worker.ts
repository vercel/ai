export function createWorker() {
  return async ({ runId }: { runId: string }) => {
    // load information from data store

    // load module for state

    // execute module with context

    // wait for updated context

    // store updated context

    // submit next job

    console.log('TODO process job', runId);
  };
}
