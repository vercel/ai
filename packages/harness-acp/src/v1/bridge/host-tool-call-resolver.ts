import type { ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import type { ACPToolCall } from '../../acp-tool-call';
import { mergeObservedToolCall } from './merge-observed-tool-call';

export type HostToolCall = {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
};

export type HostToolCallResolver = {
  resolveUpdate(options: {
    update: ToolCallUpdate;
  }): Promise<HostToolCall | undefined>;
  resolveToolCall(options: {
    toolCall: ToolCallUpdate;
  }): Promise<HostToolCall | undefined>;
  getResolution(options: {
    toolCallId: string;
  }): Promise<HostToolCall | undefined>;
  close(): void;
};

/*
 * Host tool resolution is owned by the harness adapter, which runs in the
 * host process. The bridge therefore asks the host to resolve each tool call
 * snapshot and waits for the answer. The response is validated again here
 * because the bridge uses it to authorize host tool relay requests.
 */
export function createHostToolCallResolver({
  turn,
  serverName,
  toolNames,
}: {
  turn: Pick<BridgeTurn, 'emit' | 'requestToolResult' | 'abortSignal'>;
  serverName: string;
  toolNames: ReadonlyArray<string>;
}): HostToolCallResolver {
  const snapshots = new Map<string, ACPToolCall>();
  const resolutions = new Map<string, Promise<HostToolCall | undefined>>();
  let closed = false;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<undefined>(resolve => {
    resolveClosed = () => resolve(undefined);
  });
  const abortedPromise = abortPromise({ abortSignal: turn.abortSignal });

  const request = async ({
    toolCall,
  }: {
    toolCall: ACPToolCall;
  }): Promise<HostToolCall | undefined> => {
    if (closed || turn.abortSignal.aborted) return undefined;
    const requestId = crypto.randomUUID();
    turn.emit({
      type: 'acp-host-tool-call-resolution-request',
      requestId,
      toolCall,
      serverName,
      toolNames: [...toolNames],
    });
    const result = await Promise.race([
      turn.requestToolResult(requestId),
      closedPromise,
      abortedPromise,
    ]);
    if (result == null || closed) return undefined;
    return parseHostToolCall({ output: result.output, toolNames });
  };

  return {
    resolveUpdate: ({ update }) => {
      const toolCall = mergeObservedToolCall({
        previous: snapshots.get(update.toolCallId),
        update,
      });
      snapshots.set(update.toolCallId, toolCall);
      const resolution = request({ toolCall });
      resolutions.set(update.toolCallId, resolution);
      return resolution;
    },
    resolveToolCall: ({ toolCall }) =>
      request({
        toolCall: mergeObservedToolCall({
          previous: undefined,
          update: toolCall,
        }),
      }),
    getResolution: async ({ toolCallId }) => resolutions.get(toolCallId),
    close: () => {
      if (closed) return;
      closed = true;
      resolveClosed();
      snapshots.clear();
      resolutions.clear();
    },
  };
}

function abortPromise({
  abortSignal,
}: {
  abortSignal: AbortSignal;
}): Promise<undefined> {
  if (abortSignal.aborted) return Promise.resolve(undefined);
  return new Promise(resolve => {
    abortSignal.addEventListener('abort', () => resolve(undefined), {
      once: true,
    });
  });
}

function parseHostToolCall({
  output,
  toolNames,
}: {
  output: unknown;
  toolNames: ReadonlyArray<string>;
}): HostToolCall | undefined {
  if (!isRecord(output)) return undefined;
  const hostToolCall = output.hostToolCall;
  if (
    !isRecord(hostToolCall) ||
    typeof hostToolCall.toolName !== 'string' ||
    !toolNames.includes(hostToolCall.toolName) ||
    !isRecord(hostToolCall.input)
  ) {
    return undefined;
  }
  return { toolName: hostToolCall.toolName, input: hostToolCall.input };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
