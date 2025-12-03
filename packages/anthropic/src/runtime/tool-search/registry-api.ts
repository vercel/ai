import { DeferredToolDefinition } from "./types";
import { toolSearchRegistry } from "./registry";

/**
 * Public entry point for registering an ATU tool.
 */
export function registerRuntimeTool(def: DeferredToolDefinition) {
  if (!def.name) {
    throw new Error("registerRuntimeTool: tool.name is required");
  }
  toolSearchRegistry.register(def);
}

/**
 * Public function for getting all registered tools.
 */
export function listRuntimeTools() {
  return toolSearchRegistry.list();
}
