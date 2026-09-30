import type { SessionUpdate, ToolCallUpdate } from '@agentclientprotocol/sdk';

type HostToolCall = {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
};

type ObservedCall = {
  toolCall: ToolCallUpdate;
  consumed: boolean;
  offered: boolean;
  terminal: boolean;
};

const DEFAULT_AUTHORIZATION_TTL_MS = 10_000;

export function createHostToolRelayAuthorization({
  serverName,
  toolNames,
  ttlMs = DEFAULT_AUTHORIZATION_TTL_MS,
}: {
  serverName: string;
  toolNames: ReadonlyArray<string>;
  ttlMs?: number;
}): {
  observeUpdate(options: { update: SessionUpdate }): void;
  observeAllowedPermission(options: { toolCall: ToolCallUpdate }): void;
  waitForToolCallAuthorization(options: HostToolCall): Promise<boolean>;
  close(): void;
} {
  const observedCalls = new Map<string, ObservedCall>();
  const authorizations: Array<{
    toolCallId: string;
    key: string;
    expiresAt: number;
  }> = [];
  const pendingRequests: Array<{
    key: string;
    timeout: ReturnType<typeof setTimeout>;
    resolve: (authorized: boolean) => void;
  }> = [];
  let closed = false;

  const pruneExpired = () => {
    const now = Date.now();
    for (let index = authorizations.length - 1; index >= 0; index--) {
      if (authorizations[index].expiresAt <= now) {
        authorizations.splice(index, 1);
      }
    }
  };

  const removeAuthorization = ({ toolCallId }: { toolCallId: string }) => {
    const index = authorizations.findIndex(
      authorization => authorization.toolCallId === toolCallId,
    );
    if (index !== -1) authorizations.splice(index, 1);
  };

  const observe = ({ toolCall }: { toolCall: ToolCallUpdate }) => {
    if (closed) return;
    pruneExpired();
    const previous = observedCalls.get(toolCall.toolCallId);
    if (previous?.consumed || previous?.terminal) return;
    const merged: ToolCallUpdate = {
      ...previous?.toolCall,
      ...toolCall,
      ...(toolCall.name == null && previous?.toolCall.name != null
        ? { name: previous.toolCall.name }
        : {}),
      ...(toolCall.rawInput === undefined &&
      previous?.toolCall.rawInput !== undefined
        ? { rawInput: previous.toolCall.rawInput }
        : {}),
      ...(toolCall.title == null && previous?.toolCall.title != null
        ? { title: previous.toolCall.title }
        : {}),
      ...(toolCall._meta == null && previous?.toolCall._meta != null
        ? { _meta: previous.toolCall._meta }
        : {}),
    };
    const observed: ObservedCall = {
      toolCall: merged,
      consumed: false,
      offered: previous?.offered ?? false,
      terminal: merged.status === 'completed' || merged.status === 'failed',
    };
    observedCalls.set(toolCall.toolCallId, observed);
    if (observed.terminal) {
      removeAuthorization({ toolCallId: toolCall.toolCallId });
      return;
    }
    if (observed.offered) return;

    const call = resolveHostToolCall({
      toolCall: merged,
      serverName,
      toolNames,
    });
    if (call == null) return;
    observed.offered = true;
    const key = callKey(call);
    const pendingIndex = pendingRequests.findIndex(
      request => request.key === key,
    );
    if (pendingIndex !== -1) {
      const [pending] = pendingRequests.splice(pendingIndex, 1);
      clearTimeout(pending.timeout);
      observed.consumed = true;
      pending.resolve(true);
      return;
    }
    authorizations.push({
      toolCallId: toolCall.toolCallId,
      key,
      expiresAt: Date.now() + ttlMs,
    });
  };

  return {
    observeUpdate: ({ update }) => {
      if (
        update.sessionUpdate === 'tool_call' ||
        update.sessionUpdate === 'tool_call_update'
      ) {
        observe({ toolCall: update });
      }
    },
    observeAllowedPermission: ({ toolCall }) => observe({ toolCall }),
    waitForToolCallAuthorization: ({ toolName, input }) => {
      if (closed) return Promise.resolve(false);
      pruneExpired();
      const key = callKey({ toolName, input });
      const index = authorizations.findIndex(
        authorization => authorization.key === key,
      );
      if (index !== -1) {
        const [authorization] = authorizations.splice(index, 1);
        observedCalls.get(authorization.toolCallId)!.consumed = true;
        return Promise.resolve(true);
      }
      return new Promise(resolve => {
        const pending = {
          key,
          timeout: setTimeout(() => {
            const index = pendingRequests.indexOf(pending);
            if (index !== -1) pendingRequests.splice(index, 1);
            resolve(false);
          }, ttlMs),
          resolve,
        };
        pendingRequests.push(pending);
      });
    },
    close: () => {
      if (closed) return;
      closed = true;
      observedCalls.clear();
      authorizations.length = 0;
      for (const request of pendingRequests.splice(0)) {
        clearTimeout(request.timeout);
        request.resolve(false);
      }
    },
  };
}

function resolveHostToolCall({
  toolCall,
  serverName,
  toolNames,
}: {
  toolCall: ToolCallUpdate;
  serverName: string;
  toolNames: ReadonlyArray<string>;
}): HostToolCall | undefined {
  const rawInput = toolCall.rawInput;
  if (!isRecord(rawInput)) return undefined;
  const isDeferred = 'tool_name' in rawInput;
  const isProvider = 'providerIdentifier' in rawInput;
  const isOrigin = 'origin' in rawInput || 'operation' in rawInput;
  const isCodex =
    'server' in rawInput && 'tool' in rawInput && 'arguments' in rawInput;
  if ([isDeferred, isProvider, isOrigin, isCodex].filter(Boolean).length > 1) {
    return undefined;
  }
  const matches: HostToolCall[] = [];
  for (const toolName of toolNames) {
    const qualifiedNames = [
      `mcp__${serverName}__${toolName}`,
      `${serverName}__${toolName}`,
      `mcp_${serverName}_${toolName}`,
    ];
    const isQualified = (value: unknown) =>
      typeof value === 'string' && qualifiedNames.includes(value);
    const isDirect =
      toolCall.name === toolName &&
      isRecord(toolCall._meta) &&
      toolCall._meta.serverName === serverName;
    if (
      isDeferred &&
      isQualified(rawInput.tool_name) &&
      isRecord(rawInput.tool_input) &&
      (toolCall.name == null ||
        toolCall.name === 'use_tool' ||
        isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.tool_input });
    } else if (
      isProvider &&
      rawInput.providerIdentifier === serverName &&
      rawInput.toolName === toolName &&
      isRecord(rawInput.args) &&
      (toolCall.name == null || isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.args });
    } else if (
      isCodex &&
      rawInput.server === serverName &&
      rawInput.tool === toolName &&
      isRecord(rawInput.arguments) &&
      (toolCall.name == null || isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.arguments });
    } else if (
      isOrigin &&
      rawInput.origin === serverName &&
      rawInput.operation === toolName &&
      isRecord(rawInput.arguments) &&
      (toolCall.name == null ||
        toolCall.name === toolName ||
        isQualified(toolCall.name))
    ) {
      matches.push({ toolName, input: rawInput.arguments });
    } else if (
      !isDeferred &&
      !isProvider &&
      !isOrigin &&
      !isCodex &&
      (isDirect ||
        isQualified(toolCall.name) ||
        (toolCall.name == null &&
          (isQualified(toolCall.title) ||
            toolCall.title === `${serverName}-${toolName}`)))
    ) {
      matches.push({ toolName, input: rawInput });
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function callKey({ toolName, input }: HostToolCall): string {
  return `${toolName}\0${JSON.stringify(canonicalize({ value: input }))}`;
}

function canonicalize({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalize({ value: item }));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => [key, canonicalize({ value: value[key] })]),
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
