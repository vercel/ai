import type { ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { ACPToolCall } from '../../../acp-tool-call';
import type {
  HostToolCall,
  HostToolCallResolver,
} from '../host-tool-call-resolver';
import { mergeObservedToolCall } from '../merge-observed-tool-call';

/**
 * Resolves the host tool call formats of the captured Cursor, GitHub Copilot,
 * and Grok Build fixtures, mirroring the resolvers of those harness adapters.
 */
export function resolveFixtureHostToolCall({
  toolCall,
  serverName,
  toolNames,
}: {
  toolCall: ACPToolCall;
  serverName: string;
  toolNames: ReadonlyArray<string>;
}): HostToolCall | undefined {
  const rawInput = toolCall.rawInput;
  if (!isRecord(rawInput)) return undefined;
  if (
    rawInput.providerIdentifier === serverName &&
    typeof rawInput.toolName === 'string' &&
    toolNames.includes(rawInput.toolName) &&
    isRecord(rawInput.args)
  ) {
    return { toolName: rawInput.toolName, input: rawInput.args };
  }
  const deferredToolName = toolNames.find(
    name => rawInput.tool_name === `${serverName}__${name}`,
  );
  if (deferredToolName != null) {
    return isRecord(rawInput.tool_input)
      ? { toolName: deferredToolName, input: rawInput.tool_input }
      : undefined;
  }
  const titledToolName =
    toolCall.name == null
      ? toolNames.find(name => toolCall.title === `${serverName}-${name}`)
      : undefined;
  return titledToolName == null
    ? undefined
    : { toolName: titledToolName, input: rawInput };
}

/**
 * A synchronous stand-in for the bridge resolver, which resolves through the
 * host in production.
 */
export function createFixtureHostToolCallResolver({
  serverName = 'ai-sdk-harness-tools',
  toolNames,
}: {
  serverName?: string;
  toolNames: ReadonlyArray<string>;
}): HostToolCallResolver & {
  resolveUpdateNow(options: { update: ToolCallUpdate }): HostToolCall | undefined;
} {
  const snapshots = new Map<string, ACPToolCall>();
  const resolutions = new Map<string, HostToolCall | undefined>();
  const resolveUpdateNow = ({ update }: { update: ToolCallUpdate }) => {
    const toolCall = mergeObservedToolCall({
      previous: snapshots.get(update.toolCallId),
      update,
    });
    snapshots.set(update.toolCallId, toolCall);
    const resolution = resolveFixtureHostToolCall({
      toolCall,
      serverName,
      toolNames,
    });
    resolutions.set(update.toolCallId, resolution);
    return resolution;
  };
  return {
    resolveUpdateNow,
    resolveUpdate: async ({ update }) => resolveUpdateNow({ update }),
    resolveToolCall: async ({ toolCall }) =>
      resolveFixtureHostToolCall({
        toolCall: mergeObservedToolCall({ previous: undefined, update: toolCall }),
        serverName,
        toolNames,
      }),
    getResolution: async ({ toolCallId }) => resolutions.get(toolCallId),
    close: () => {
      snapshots.clear();
      resolutions.clear();
    },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
