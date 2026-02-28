import { getErrorMessage, JSONValue } from '@ai-sdk/provider';
import { Tool, ToolResultOutput } from '@ai-sdk/provider-utils';

export async function createToolModelOutput({
  toolCallId,
  input,
  output,
  tool,
  errorMode,
  errorCode,
}: {
  toolCallId: string;
  input: unknown;
  output: unknown;
  tool: Tool | undefined;
  errorMode: 'none' | 'text' | 'json';
  errorCode?: string;
}): Promise<ToolResultOutput> {
  if (errorMode === 'text') {
    return { type: 'error-text', value: getErrorMessage(output) };
  } else if (errorMode === 'json') {
    return {
      type: 'error-json',
      value:
        errorCode != null
          ? { errorCode, errorText: getErrorMessage(output) }
          : toJSONValue(output),
    };
  }

  if (tool?.toModelOutput) {
    return await tool.toModelOutput({ toolCallId, input, output });
  }

  return typeof output === 'string'
    ? { type: 'text', value: output }
    : { type: 'json', value: toJSONValue(output) };
}

function toJSONValue(value: unknown): JSONValue {
  return value === undefined ? null : (value as JSONValue);
}
