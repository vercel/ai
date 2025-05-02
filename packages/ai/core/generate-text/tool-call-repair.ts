import { JSONSchema7, LanguageModelV2ToolCall } from '@ai-sdk/provider';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { ModelMessage } from '../prompt';
import { ToolSet } from './tool-set';

/**
 * A function that attempts to repair a tool call that failed to parse.
 *
 * It receives the error and the context as arguments and returns the repair
 * tool call JSON as text.
 *
 * @param options.system - The system prompt.
 * @param options.messages - The messages in the current generation step.
 * @param options.toolCall - The tool call that failed to parse.
 * @param options.tools - The tools that are available.
 * @param options.parameterSchema - A function that returns the JSON Schema for a tool.
 * @param options.error - The error that occurred while parsing the tool call.
 */
export type ToolCallRepairFunction<TOOLS extends ToolSet> = (options: {
  system: string | undefined;
  messages: ModelMessage[];
  toolCall: LanguageModelV2ToolCall;
  tools: TOOLS;
  parameterSchema: (options: { toolName: string }) => JSONSchema7;
  error: NoSuchToolError | InvalidToolArgumentsError;
}) => Promise<LanguageModelV2ToolCall | null>;
