import { getErrorMessage, type JSONValue } from '@ai-sdk/provider';
import type { Tool, ToolResultOutput } from '@ai-sdk/provider-utils';

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
    return { type: 'error-json', value: toJSONValue(output) };
  }

  if (tool?.toModelOutput) {
    return await tool.toModelOutput({ toolCallId, input, output });
  }

  return typeof output === 'string'
    ? { type: 'text', value: output }
    : { type: 'json', value: toJSONValue(output) };
}

function toJSONValue(value: unknown): JSONValue {
  return normalizeForJSONValue(value) ?? null;
}

function normalizeForJSONValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): JSONValue | undefined {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(item => {
      const nested = normalizeForJSONValue(item, seen) ?? null;
      return nested;
    });
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof URL) {
    return value.href;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return undefined;
    }

    seen.add(value);
    const jsonValue = Object.fromEntries(
      Object.entries(value)
        .map(([key, nested]) => [key, normalizeForJSONValue(nested, seen)])
        .filter(([, nested]) => nested !== undefined),
    ) as JSONValue;
    seen.delete(value);

    return jsonValue;
  }

  return null;
}
