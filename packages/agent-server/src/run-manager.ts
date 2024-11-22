import { createIdGenerator } from '@ai-sdk/provider-utils';
import { loadModule } from './util/load-module';
import { Agent } from './types/agent';
import * as path from 'node:path';

export class RunManager {
  private readonly generateRunId: () => string;
  private readonly agentsPath: string;

  constructor({ agentsPath }: { agentsPath: string }) {
    this.generateRunId = createIdGenerator({ prefix: 'run' });
    this.agentsPath = agentsPath;
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

    // durability: store run metadata (id, agent, created at), context, state,etc
    // add job to queue

    return { runId };
  }
}
