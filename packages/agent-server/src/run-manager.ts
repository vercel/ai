import { createIdGenerator } from '@ai-sdk/provider-utils';
import pino from 'pino';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { StreamManager } from './stream-manager';

export class RunManager {
  private readonly generateRunId: () => string;
  private readonly dataStore: DataStore;
  private readonly moduleLoader: ModuleLoader;
  private readonly submitJob: (job: any) => Promise<void>;
  private readonly streamManager: StreamManager;
  private readonly logger: pino.Logger;

  constructor({
    dataStore,
    moduleLoader,
    submitJob,
    streamManager,
    logger,
  }: {
    dataStore: DataStore;
    moduleLoader: ModuleLoader;
    submitJob: (job: { runId: string }) => Promise<void>;
    streamManager: StreamManager;
    logger: pino.Logger;
  }) {
    this.generateRunId = createIdGenerator({ prefix: 'run' });
    this.dataStore = dataStore;
    this.moduleLoader = moduleLoader;
    this.submitJob = submitJob;
    this.streamManager = streamManager;
    this.logger = logger;
  }

  async startWorkflow({
    workflow,
    request,
  }: {
    workflow: string;
    request: Request;
  }) {
    const workflowModule = await this.moduleLoader.loadWorkflow({ workflow });

    this.logger.info(`workflow ${workflow} starting`);

    const { context, initialTask } = await workflowModule.start({
      request,
      metadata: { workflowName: workflow },
    });

    // const runId = this.generateRunId();
    const runId = `${workflow}-${Date.now()}`; // for easier data inspection

    await this.dataStore.updateRun({
      runId,
      workflow,
      task: initialTask,
      context,
      createdAt: Date.now(),
      step: 1,
    });

    this.streamManager.createStream(runId);

    await this.submitJob({ runId });

    this.logger.info(`${runId} of workflow ${workflow} started`);

    return { runId, headers: workflowModule.headers };
  }
}
