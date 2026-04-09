import type { Tool } from './tool';

/**
 * Infer the context type of a tool.
 */
export type InferToolContext<TOOL extends Tool<any, any, any>> =
  TOOL extends Tool<any, any, infer CONTEXT> ? CONTEXT : never;
