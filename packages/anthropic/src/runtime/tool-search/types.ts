import { JSONSchema7 } from '@ai-sdk/provider';

/**
 * A runtime-searchable tool definition stored in the registry.
 * This is not the full Anthropic tool — it's the minimal form used for ranking.
 */
export interface DeferredToolDefinition {
  name: string;
  description: string;
  inputSchema?: JSONSchema7;
  keywords?: string[];
  allowedCallers?: string[];
  examples?: unknown[];
}
