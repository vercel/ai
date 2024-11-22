import { JSONValue } from '@ai-sdk/provider';
import { createIdGenerator } from '@ai-sdk/provider-utils';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';

export class RunManager {
  private readonly generateRunId: () => string;
  private readonly dataStore: DataStore;
  private readonly moduleLoader: ModuleLoader;
  private readonly submitJob: (job: any) => Promise<void>;

  constructor({
    dataStore,
    moduleLoader,
    submitJob,
  }: {
    dataStore: DataStore;
    moduleLoader: ModuleLoader;
    submitJob: (job: any) => Promise<void>;
  }) {
    this.generateRunId = createIdGenerator({ prefix: 'run' });
    this.dataStore = dataStore;
    this.moduleLoader = moduleLoader;
    this.submitJob = submitJob;
  }

  async startAgent({ agent, request }: { agent: string; request: Request }) {
    const agentModule = await this.moduleLoader.loadAgent<JSONValue>({ agent });

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

    await this.submitJob({ runId });

    return { runId };
  }
}
