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

/**
 * Normalizes an in-process tool output to a plain JSON value
 * (applies `toJSON`, converts `Date`, drops `undefined`, etc.)
 * by round-tripping it through `JSON.stringify`.
 *
 * The parsed text is produced by `JSON.stringify` from a value that is
 * already materialized in this process, so it is not untrusted input.
 * `JSON.parse` is used deliberately instead of the secure parser from
 * `@ai-sdk/provider-utils`: the secure parser rejects own `__proto__` and
 * `constructor.prototype` keys, which are valid data in tool outputs
 * (e.g. rows from an external API). `JSON.parse` defines `__proto__` as an
 * own data property and never modifies the prototype chain, so preserving
 * these keys here is safe. Do not reuse this pattern for text that comes
 * from outside the process; use `parseJSON` / `safeParseJSON` instead.
 */
function toJSONValue(value: unknown): JSONValue {
  if (value === undefined) {
    return null;
  }

  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}
