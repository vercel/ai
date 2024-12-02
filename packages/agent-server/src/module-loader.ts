import { JSONValue } from '@ai-sdk/provider';
import * as path from 'node:path';
import { Agent } from './types/agent';
import { StreamTask } from './types/task';

export class ModuleLoader {
  private readonly modulePath: string;

  constructor({ modulePath }: { modulePath: string }) {
    this.modulePath = modulePath;
  }

  async loadModule<T>({ path: pathElements }: { path: string[] }): Promise<T> {
    try {
      // Add timestamp to bust cache (to ensure we always get the latest version)
      const fullPath = path.join(this.modulePath, ...pathElements);
      const pathWithoutCaching = `${fullPath}?update=${Date.now()}`;
      return (await import(pathWithoutCaching)).default as T;
    } catch (error) {
      throw new Error(`Failed to load module ${path}: ${error}`);
    }
  }

  async loadAgent({ agent }: { agent: string }): Promise<Agent<JSONValue>> {
    return this.loadModule<Agent<JSONValue>>({
      path: [agent, 'agent.js'],
    });
  }

  async loadTask({
    agent,
    task,
  }: {
    agent: string;
    task: string;
  }): Promise<StreamTask<JSONValue, JSONValue>> {
    return this.loadModule<StreamTask<JSONValue, JSONValue>>({
      path: [agent, 'tasks', `${task}.js`],
    });
  }
}
