import type { Tool } from '@ai-sdk/provider-utils';

/**
 * Returns the tool call with the fields that are defined by the server-side
 * tool (`toolMetadata`, `dynamic`, and `title`) rebuilt from `tool`.
 *
 * Tool calls emitted by a workflow step and tool calls replayed from
 * client-supplied history can omit or alter these fields, while approval
 * policies read them to decide whether a call is protected. Removing the
 * fields first makes the current server-side definition the only source, so a
 * field that the tool no longer defines does not survive from an earlier one.
 */
export function withServerToolFields<TOOL_CALL extends { type: 'tool-call' }>(
  toolCall: TOOL_CALL,
  tool: Tool | undefined,
): TOOL_CALL {
  const {
    toolMetadata: _toolMetadata,
    dynamic: _dynamic,
    title: _title,
    ...rest
  } = toolCall as TOOL_CALL & {
    toolMetadata?: unknown;
    dynamic?: boolean;
    title?: string;
  };

  return {
    ...rest,
    ...(tool?.metadata != null ? { toolMetadata: tool.metadata } : {}),
    ...(tool?.type === 'dynamic' ? { dynamic: true } : {}),
    ...(tool?.title != null ? { title: tool.title } : {}),
  } as TOOL_CALL;
}
