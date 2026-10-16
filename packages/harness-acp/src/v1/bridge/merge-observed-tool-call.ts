import type { ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { ACPToolCall } from '../../acp-tool-call';

export function mergeObservedToolCall({
  previous,
  update,
}: {
  previous: ACPToolCall | undefined;
  update: ToolCallUpdate;
}): ACPToolCall {
  return {
    ...previous,
    toolCallId: update.toolCallId,
    ...((update.name ?? previous?.name) == null
      ? {}
      : { name: update.name ?? previous?.name }),
    title: update.title ?? previous?.title ?? `Tool ${update.toolCallId}`,
    ...(update.kind === undefined ? {} : { kind: update.kind ?? undefined }),
    ...(update.status === undefined
      ? {}
      : { status: update.status ?? undefined }),
    ...(update.content === undefined
      ? {}
      : { content: update.content ?? undefined }),
    ...(update.locations === undefined
      ? {}
      : { locations: update.locations ?? undefined }),
    ...(update.rawInput === undefined ? {} : { rawInput: update.rawInput }),
    ...(update.rawOutput === undefined ? {} : { rawOutput: update.rawOutput }),
    ...(update._meta === undefined ? {} : { _meta: update._meta }),
  };
}
