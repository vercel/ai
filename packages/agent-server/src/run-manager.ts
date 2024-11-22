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

  async startAgent({ agent, request }: { agent: string; request: Request }) {
    const agentModule = await this.moduleLoader.loadAgent({ agent });

    this.logger.info(`agent ${agent} starting`);

    const { context, initialState } = await agentModule.start({
      request,
      metadata: { agentName: agent },
    });

    // const runId = this.generateRunId();
    const runId = `${agent}-${Date.now()}`; // for easier data inspection

    await this.dataStore.updateRun({
      runId,
      agent,
      state: initialState,
      context,
      createdAt: Date.now(),
      step: 1,
    });

    this.streamManager.createStream(runId);

    await this.submitJob({ runId });

    this.logger.info(`${runId} of agent ${agent} started`);

    return { runId, headers: agentModule.headers };
  }
}
