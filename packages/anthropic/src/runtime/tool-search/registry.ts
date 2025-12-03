import { DeferredToolDefinition } from './types';

const _registry: DeferredToolDefinition[] = [];

/**
 * Register a tool so that it becomes discoverable
 * by the tool-search runtime.
 */
export function registerDeferredTool(tool: DeferredToolDefinition) {
  const exists = _registry.some(t => t.name === tool.name);
  if (!exists) {
    _registry.push(tool);
  }
}

/**
 * Returns all registered deferred tools.
 */
export function listDeferredTools(): DeferredToolDefinition[] {
  return [..._registry];
}
