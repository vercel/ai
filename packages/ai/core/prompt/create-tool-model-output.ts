import {
  getErrorMessage,
  JSONValue,
  LanguageModelV2ToolResultOutput,
} from '@ai-sdk/provider';
import { Tool } from '../tool';

export function createToolModelOutput({
  output,
  tool,
  isError,
}: {
  output: unknown;
  tool: Tool | undefined;
  isError: boolean;
}): LanguageModelV2ToolResultOutput {
  if (isError) {
    return {
      type: 'error',
      value: getErrorMessage(output),
    };
  }

  if (tool?.toModelOutput) {
    return tool.toModelOutput(output);
  }

  return typeof output === 'string'
    ? { type: 'text', value: output }
    : { type: 'json', value: output as JSONValue };
}
