import * as path from 'node:path';
import { Agent } from './types/agent';
import { JSONValue } from '@ai-sdk/provider';

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

  async loadAgent<CONTEXT extends JSONValue>({
    agent,
  }: {
    agent: string;
  }): Promise<Agent<CONTEXT>> {
    return this.loadModule<Agent<CONTEXT>>({
      path: [agent, 'agent.js'],
    });
  }
}
