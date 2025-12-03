import { DeferredToolDefinition } from './types';

/**
 * Internal registry storing all runtime-searchable tools.
 */
class ToolSearchRegistry {
  private tools: DeferredToolDefinition[] = [];

  register(tool: DeferredToolDefinition) {
    this.tools.push(tool);
  }

  list(): DeferredToolDefinition[] {
    return this.tools;
  }
}

export const toolSearchRegistry = new ToolSearchRegistry();
