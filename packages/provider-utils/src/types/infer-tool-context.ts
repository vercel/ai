import { HasRequiredKey } from '../has-required-key';
import type { Tool } from './tool';

/**
 * Infer the context type of a tool.
 */
export type InferToolContext<TOOL extends Tool> =
  TOOL extends Tool<any, any, infer CONTEXT>
    ? HasRequiredKey<CONTEXT> extends true
      ? CONTEXT
      : never
    : never;
