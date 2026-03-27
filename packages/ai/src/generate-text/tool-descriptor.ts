import type { JSONSchema7 } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';

/**
 * A serializable descriptor for a function tool, containing only the
 * information needed by the model to understand and call the tool.
 *
 * This is the serializable output of `prepareToolsAndToolChoice` —
 * it contains JSON schemas (not Zod objects) and no execute functions,
 * making it safe to pass across serialization boundaries (e.g., Workflow
 * step functions).
 *
 * This type intentionally aliases the internal LanguageModelV4FunctionTool
 * to shield consumers from provider spec version changes.
 */
export interface FunctionToolDescriptor {
  type: 'function';
  name: string;
  description?: string;
  title?: string;
  inputSchema: JSONSchema7;
  inputExamples?: Array<Record<string, unknown>>;
  providerOptions?: ProviderOptions;
  strict?: boolean;
}

/**
 * A serializable descriptor for a provider-managed tool.
 */
export interface ProviderToolDescriptor {
  type: 'provider';
  name: string;
  id: string;
  args?: Record<string, unknown>;
}

/**
 * A serializable tool descriptor — either a function tool or a provider tool.
 */
export type ToolDescriptor = FunctionToolDescriptor | ProviderToolDescriptor;

/**
 * A serializable tool choice descriptor.
 *
 * This type intentionally aliases the internal LanguageModelV4ToolChoice
 * to shield consumers from provider spec version changes.
 */
export type ToolChoiceDescriptor =
  | { type: 'auto' }
  | { type: 'none' }
  | { type: 'required' }
  | { type: 'tool'; toolName: string };
