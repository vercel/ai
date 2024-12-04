import { JSONValue } from '@ai-sdk/provider';
import pino from 'pino';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { StreamManager } from './stream-manager';

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

    logger.info(`task ${runState.task} executing in ${runId}`);

    const streams: Set<ReadableStream<JSONValue>> = new Set();

    const taskModule = await moduleLoader.loadTask({
      workflow: runState.workflow,
      task: runState.task,
    });

    await dataStore.storeStepState({
      runId,
      step: runState.step,
      status: 'RUNNING',
      inputContext: runState.context,
    });

    const { context, nextTask: nextTaskPromise } = await taskModule.execute({
      context: runState.context,
      mergeStream: stream => {
        const [newStream, original] = stream.tee();
        streams.add(newStream);
        streamManager.addToStream(runId, original); // immediately forward to client
      },
    });

    const nextTask = await nextTaskPromise;

    // consume all streams without backpressure and store it
    // to enable multiple consumers and re-consumption
    for (const stream of streams) {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // store chunk
        await dataStore.appendToStepStream({
          runId,
          step: runState.step,
          chunk: value,
        });
      }
    }

    // wait for updated context. if undefined, we use the old context
    const updatedContext =
      context === undefined ? runState.context : await context;

    // store updated context
    await dataStore.storeStepState({
      runId,
      step: runState.step,
      status: 'FINISHED',
      inputContext: runState.context,
      outputContext: updatedContext,
      nextTask,
    });

    await dataStore.updateRun({
      runId,
      workflow: runState.workflow,
      createdAt: runState.createdAt,
      task: nextTask,
      context: updatedContext,
      step: runState.step + 1,
    });

    // submit next job or end
    if (nextTask === 'END') {
      streamManager.closeStream(runId);
      logger.info(`run ${runId} ended`);
    } else {
      submitJob({ runId });
      logger.info(`run ${runId} submitted job for ${nextTask}`);
    }
  };
}
