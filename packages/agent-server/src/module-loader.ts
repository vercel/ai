import { JSONValue } from '@ai-sdk/provider';
import * as path from 'node:path';
import { Task } from './types/task';
import { Workflow } from './types/workflow';

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

  async loadWorkflow({
    workflow,
  }: {
    workflow: string;
  }): Promise<Workflow<JSONValue>> {
    return this.loadModule<Workflow<JSONValue>>({
      path: [workflow, 'workflow.js'],
    });
  }

  async loadTask({
    workflow,
    task,
  }: {
    workflow: string;
    task: string;
  }): Promise<Task<JSONValue>> {
    return this.loadModule<Task<JSONValue>>({
      path: [workflow, 'tasks', `${task}.js`],
    });
  }
}
