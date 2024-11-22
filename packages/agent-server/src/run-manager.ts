import { JSONValue } from '@ai-sdk/provider';
import { createIdGenerator } from '@ai-sdk/provider-utils';
import * as path from 'node:path';
import { DataStore } from './data-store';
import { Agent } from './types/agent';
import { loadModule } from './util/load-module';

export class RunManager {
  private readonly generateRunId: () => string;
  private readonly agentsPath: string;
  private readonly dataStore: DataStore;
  private readonly submitJob: (job: any) => Promise<void>;

  constructor({
    agentsPath,
    dataStore,
    submitJob,
  }: {
    agentsPath: string;
    dataStore: DataStore;
    submitJob: (job: any) => Promise<void>;
  }) {
    this.generateRunId = createIdGenerator({ prefix: 'run' });
    this.agentsPath = agentsPath;
    this.dataStore = dataStore;
    this.submitJob = submitJob;
  }

  async startAgent({ agent, request }: { agent: string; request: Request }) {
    const agentModule = await loadModule<Agent<JSONValue>>({
      path: path.join(this.agentsPath, agent, 'agent.js'),
    });

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
