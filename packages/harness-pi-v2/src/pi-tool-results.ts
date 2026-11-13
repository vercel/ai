import type {
  HarnessV2EffectOutput,
  HarnessV2ToolExecutionOutput,
  HarnessV2ToolExecutionValue,
} from '@ai-sdk/harness';
import {
  convertHarnessToolModelOutput,
  normalizeHarnessToolModelOutput,
} from '@ai-sdk/harness/utils';
import type { JSONValue } from '@ai-sdk/provider';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import { toJSONValue } from './to-json-value';

/**
 * Converts the result of a Pi tool execution into the JSON value recorded
 * for a built-in tool call: the model-facing content, the tool's details,
 * and whether the result is an error.
 */
export function toBuiltinToolValue(options: {
  /**
   * Result returned by the Pi tool.
   */
  result: AgentToolResult<unknown>;
}): HarnessV2ToolExecutionValue {
  const { content, details, isError } = options.result;
  const raw: Pick<AgentToolResult<unknown>, 'content' | 'details'> & {
    isError?: true;
  } = { content, details };
  if (isError) raw.isError = true;
  return { raw: toJSONValue({ value: raw }) };
}

/**
 * Returns whether a value has the shape recorded by `toBuiltinToolValue()`.
 */
function isBuiltinToolRaw(value: unknown): value is {
  content: Array<TextContent | ImageContent>;
  details?: JSONValue;
  isError?: boolean;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/**
 * Converts a recorded tool value into the result Pi places in the
 * transcript.
 *
 * A built-in tool value is rebuilt from its recorded content, details and
 * error flag. A host tool value uses its model-facing output when the tool
 * defines one (with text and inline images; `error-*` and
 * `execution-denied` outputs are error results), and otherwise the raw
 * output, as text when it is a string and as JSON text otherwise.
 */
export function toAgentToolResult(options: {
  /**
   * Recorded tool value.
   */
  value: HarnessV2ToolExecutionValue;

  /**
   * Whether the value belongs to one of the harness's built-in tools.
   */
  builtin: boolean;
}): AgentToolResult<unknown> {
  const { value, builtin } = options;
  if (builtin && isBuiltinToolRaw(value.raw)) {
    const result: AgentToolResult<unknown> = {
      content: value.raw.content,
      details: value.raw.details,
    };
    if (value.raw.isError === true) result.isError = true;
    return result;
  }
  if (value.modelOutput != null) {
    const converted = convertHarnessToolModelOutput({
      output: normalizeHarnessToolModelOutput({ output: value.modelOutput }),
    });
    const result: AgentToolResult<unknown> = {
      content: converted.content.map(part =>
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : { type: 'image', data: part.data, mimeType: part.mediaType },
      ),
      details: undefined,
    };
    if (converted.isError) result.isError = true;
    return result;
  }
  return {
    content: [
      {
        type: 'text',
        text:
          typeof value.raw === 'string' ? value.raw : JSON.stringify(value.raw),
      },
    ],
    details: undefined,
  };
}

/**
 * Describes a tool call outcome that has no result value, as the text of the
 * error result Pi shows the model.
 *
 * An interrupted call includes its last partial output, so the model knows
 * what the call may already have done. Providers reject empty error results,
 * so an error without a message is described by the tool name.
 */
export function describeToolFailure(options: {
  /**
   * Outcome of the tool call.
   */
  output: Exclude<HarnessV2ToolExecutionOutput, { type: 'result' }>;

  /**
   * Name of the called tool.
   */
  toolName: string;
}): string {
  const { output, toolName } = options;
  switch (output.type) {
    case 'error':
      return output.error.message || `${toolName} failed with no message`;
    case 'interrupted': {
      const message = `The ${toolName} call was interrupted before it finished.`;
      if (output.partial == null) return message;
      return `${message}\nPartial output before the interruption:\n${JSON.stringify(output.partial.raw)}`;
    }
    case 'denied':
      return output.reason || `The ${toolName} call was denied.`;
    case 'suspended':
      return output.reason === 'approval'
        ? `The ${toolName} call requires approval, which is not supported.`
        : `The ${toolName} tool must be executed by the client, which is not supported.`;
  }
}

/**
 * Converts a recorded tool effect output into the result Pi places in the
 * transcript for the call, e.g. when restoring a turn that ended while its
 * last response's tool calls were not all answered.
 */
export function toRecordedAgentToolResult(options: {
  /**
   * Recorded output of the tool effect.
   */
  output: HarnessV2EffectOutput<HarnessV2ToolExecutionValue>;

  /**
   * Name of the called tool.
   */
  toolName: string;

  /**
   * Whether the call was one of the harness's built-in tools.
   */
  builtin: boolean;
}): AgentToolResult<unknown> {
  const { output } = options;
  if (output.type === 'result') {
    return toAgentToolResult({ value: output.value, builtin: options.builtin });
  }
  return {
    content: [
      {
        type: 'text',
        text: describeToolFailure({ output, toolName: options.toolName }),
      },
    ],
    details: undefined,
    isError: true,
  };
}
