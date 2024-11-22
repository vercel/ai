import { createIdGenerator } from '@ai-sdk/provider-utils';
import * as path from 'node:path';
import { DataStore } from './data-store';
import { Agent } from './types/agent';
import { loadModule } from './util/load-module';

export class RunManager {
  private readonly generateRunId: () => string;
  private readonly agentsPath: string;
  private readonly dataStore: DataStore;

  constructor({
    agentsPath,
    dataStore,
  }: {
    agentsPath: string;
    dataStore: DataStore;
  }) {
    this.generateRunId = createIdGenerator({ prefix: 'run' });
    this.agentsPath = agentsPath;
    this.dataStore = dataStore;
  }

  async startAgent({ name, request }: { name: string; request: Request }) {
    const agent = await loadModule<Agent<any>>({
      path: path.join(this.agentsPath, name, 'agent.js'),
    });

    const { context } = await agent.start({
      request,
      metadata: { agentName: name },
    });
    const runId = this.generateRunId();
    const state = await agent.nextState({ currentState: 'START', context });

    await this.dataStore.updateRun({
      runId,
      agent: name,
      state,
      context,
      createdAt: Date.now(),
    });

    return { runId };
  }
}
