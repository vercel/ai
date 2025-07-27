import {
  getErrorMessage,
  JSONValue,
  LanguageModelV2ToolResultOutput,
} from '@ai-sdk/provider';
import { Tool } from '@ai-sdk/provider-utils';

export function createToolModelOutput({
  output,
  tool,
  errorMode,
}: {
  output: unknown;
  tool: Tool | undefined;
  errorMode: 'none' | 'text' | 'json';
}): LanguageModelV2ToolResultOutput {
  if (errorMode === 'text') {
    return { type: 'error-text', value: getErrorMessage(output) };
  } else if (errorMode === 'json') {
    return { type: 'error-json', value: output as JSONValue };
  }

  if (tool?.toModelOutput) {
    return tool.toModelOutput(output);
  }

  return typeof output === 'string'
    ? { type: 'text', value: output }
    : { type: 'json', value: output as JSONValue };
}
