import { ModelMessage } from '@ai-sdk/provider-utils';
import { ToolSet } from './tool-set';

/**
 * Handler that determines what to do when a tool execution fails.
 *
 * @param options - The error context including toolCallId, toolName, input, error, and messages
 * @returns 'retry' to re-throw the error (default behavior) or 'send-to-llm' to convert error to tool result sent to the model
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   model,
 *   tools,
 *   experimental_toolErrorHandler: async ({ error }) => {
 *     // Let LLM handle validation errors, retry system errors
 *     return error instanceof ValidationError ? 'send-to-llm' : 'retry';
 *   }
 * });
 * ```
 */
export type ToolErrorHandler<TOOLS extends ToolSet> = (options: {
  /**
   * The ID of the tool call that failed.
   */
  toolCallId: string;

  /**
   * The name of the tool that failed.
   */
  toolName: string;

  /**
   * The input that was passed to the tool.
   */
  input: unknown;

  /**
   * The error that was thrown by the tool.
   */
  error: unknown;

  /**
   * The messages in the conversation up to this point.
   */
  messages: ModelMessage[];
}) => 'retry' | 'send-to-llm' | Promise<'retry' | 'send-to-llm'>;
