import { getErrorMessage, type JSONValue } from '@ai-sdk/provider';
import {
  parseJSON,
  type Tool,
  type ToolResultOutput,
} from '@ai-sdk/provider-utils';

export async function createToolModelOutput({
  toolCallId,
  input,
  output,
  tool,
  errorMode,
}: {
  toolCallId: string;
  input: unknown;
  output: unknown;
  tool: Tool | undefined;
  errorMode: 'none' | 'text' | 'json';
}): Promise<ToolResultOutput> {
  if (errorMode === 'text') {
    return { type: 'error-text', value: getErrorMessage(output) };
  } else if (errorMode === 'json') {
    return { type: 'error-json', value: await toJSONValue(output) };
  }

  if (tool?.toModelOutput) {
    return await tool.toModelOutput({ toolCallId, input, output });
  }

  return typeof output === 'string'
    ? { type: 'text', value: output }
    : { type: 'json', value: await toJSONValue(output) };
}

async function toJSONValue(value: unknown): Promise<JSONValue> {
  if (value === undefined) {
    return null;
  }

  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? null
    : await parseJSON({ text: serialized });
}
