import { createIdGenerator } from '@ai-sdk/provider-utils';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { StreamManager } from './stream-manager';

export class RunManager {
  private readonly generateRunId: () => string;
  private readonly dataStore: DataStore;
  private readonly moduleLoader: ModuleLoader;
  private readonly submitJob: (job: any) => Promise<void>;
  private readonly streamManager: StreamManager;

  constructor({
    dataStore,
    moduleLoader,
    submitJob,
    streamManager,
  }: {
    dataStore: DataStore;
    moduleLoader: ModuleLoader;
    submitJob: (job: { runId: string }) => Promise<void>;
    streamManager: StreamManager;
  }) {
    this.generateRunId = createIdGenerator({ prefix: 'run' });
    this.dataStore = dataStore;
    this.moduleLoader = moduleLoader;
    this.submitJob = submitJob;
    this.streamManager = streamManager;
  }

  async startAgent({ agent, request }: { agent: string; request: Request }) {
    const agentModule = await this.moduleLoader.loadAgent({ agent });

    const { context } = await agentModule.start({
      request,
      metadata: { agentName: agent },
    });
    const runId = this.generateRunId();
    const state = await agentModule.nextState({
      currentState: 'START',
      context,
    });

    await this.dataStore.updateRun({
      runId,
      agent,
      state,
      context,
      createdAt: Date.now(),
    });

    this.streamManager.createStream(runId);

    await this.submitJob({ runId });

    return { runId, headers: agentModule.headers };
  }
}
