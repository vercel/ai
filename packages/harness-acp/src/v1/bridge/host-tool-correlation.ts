import type {
  ActiveSessionMessage,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type { ACPToolCall } from '../../acp-tool-call';
import { canonicalFingerprint } from './canonical-json-fingerprint';
import type {
  HostToolCall,
  HostToolCallResolver,
} from './host-tool-call-resolver';
import { mergeObservedToolCall } from './merge-observed-tool-call';

type SessionUpdateMessage = Extract<
  ActiveSessionMessage,
  { readonly kind: 'session_update' }
>;

type BufferedUpdate = {
  readonly message: SessionUpdateMessage;
  readonly rawUpdate: unknown;
};

type CorrelationInvocation = {
  readonly token: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly inputFingerprint: string;
  readonly order: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
  toolCallId?: string;
};

type CorrelationCandidate = {
  readonly toolCallId: string;
  readonly order: number;
  readonly evidence: unknown[];
};

const CORRELATION_WINDOW_MS = 1000;
const MAX_BUFFERED_UPDATES = 128;

export function createHostToolCorrelation({
  emitSemanticUpdate,
  emitRawUpdate,
  hostToolServerName,
  hostTools,
  hostToolCallResolver,
}: {
  emitSemanticUpdate: (options: {
    message: SessionUpdateMessage;
    rawUpdate: unknown;
  }) => void;
  emitRawUpdate: (options: { rawUpdate: unknown }) => void;
  hostToolServerName: string;
  hostTools: ReadonlyArray<{ readonly name: string }>;
  hostToolCallResolver: Pick<
    HostToolCallResolver,
    'getResolution' | 'resolveToolCall'
  >;
}): {
  update(options: {
    message: SessionUpdateMessage;
    rawUpdate?: unknown;
    hostToolCall?: HostToolCall;
  }): void;
  registerInvocation(options: {
    token: string;
    serverName: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
    order: number;
  }): void;
  applyHostToolCall(options: {
    toolCallId: string;
    hostToolCall: HostToolCall | undefined;
  }): void;
  claimHostToolPermission(options: {
    toolCall: ToolCallUpdate;
  }): Promise<HostToolCall | undefined>;
  suppressToolCall(options: { toolCallId: string }): void;
  getToolCall(options: { toolCallId: string }): ACPToolCall | undefined;
  isToolCallReleased(options: { toolCallId: string }): boolean;
  deferFlush(): { release(): void };
  flush(): void;
  removeInvocation(options: { token: string }): void;
  close(): void;
} {
  const invocations = new Map<string, CorrelationInvocation>();
  const candidates = new Map<string, CorrelationCandidate>();
  const suppressedToolCallIds = new Set<string>();
  const releasedToolCallIds = new Set<string>();
  const observedToolCalls = new Map<string, ACPToolCall>();
  let nextCandidateOrder = 0;
  let buffered: BufferedUpdate[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushHolds = 0;
  let flushPending = false;

  const flush = () => {
    flushPending = false;
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    if (buffered.length === 0) return;
    const updates = buffered;
    buffered = [];
    for (const update of updates) {
      if (
        isToolUpdate(update.message) &&
        suppressedToolCallIds.has(update.message.update.toolCallId)
      ) {
        continue;
      }
      if (isToolUpdate(update.message)) {
        releasedToolCallIds.add(update.message.update.toolCallId);
      }
      emitSemanticUpdate(update);
    }
    for (const toolCallId of candidates.keys()) {
      if (!suppressedToolCallIds.has(toolCallId)) {
        releasedToolCallIds.add(toolCallId);
      }
    }
    candidates.clear();
  };

  const scheduleFlush = () => {
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      /*
       * A tool call update may be waiting for its host tool resolution. Its
       * earlier buffered updates must not be released before that resolution
       * is known, or a host tool call could leak into the stream.
       */
      if (flushHolds > 0) {
        flushPending = true;
        return;
      }
      flush();
    }, CORRELATION_WINDOW_MS);
    flushTimer.unref?.();
  };

  const suppressBufferedToolCall = ({ toolCallId }: { toolCallId: string }) => {
    suppressedToolCallIds.add(toolCallId);
    candidates.delete(toolCallId);
    buffered = buffered.filter(
      item =>
        !isToolUpdate(item.message) ||
        item.message.update.toolCallId !== toolCallId,
    );
  };

  const suppressCandidate = ({
    candidate,
    invocation,
  }: {
    candidate: CorrelationCandidate;
    invocation: CorrelationInvocation;
  }) => {
    invocation.toolCallId = candidate.toolCallId;
    suppressBufferedToolCall({ toolCallId: candidate.toolCallId });
    deleteInvocation({ invocations, token: invocation.token });
  };

  const suppressToolCallUpdate = ({ toolCallId }: { toolCallId: string }) => {
    suppressBufferedToolCall({ toolCallId });
    if (candidates.size === 0) flush();
  };

  const reconcile = () => {
    const orderedInvocations = [...invocations.values()].sort(
      (left, right) => left.order - right.order,
    );
    const orderedCandidates = [...candidates.values()].sort(
      (left, right) => left.order - right.order,
    );
    for (const invocation of orderedInvocations) {
      if (invocation.toolCallId != null) continue;
      const candidate = orderedCandidates.find(
        item =>
          candidates.has(item.toolCallId) &&
          hasPortableEvidence({ candidate: item, invocation }),
      );
      if (candidate != null) suppressCandidate({ candidate, invocation });
    }
    if (candidates.size === 0) flush();
  };

  return {
    update: ({ message, rawUpdate, hostToolCall }) => {
      const preservedUpdate =
        rawUpdate === undefined ? message.update : rawUpdate;
      emitRawUpdate({ rawUpdate: preservedUpdate });
      if (!isToolUpdate(message)) {
        if (buffered.length === 0) {
          emitSemanticUpdate({ message, rawUpdate: preservedUpdate });
        } else {
          buffered.push({ message, rawUpdate: preservedUpdate });
          if (buffered.length >= MAX_BUFFERED_UPDATES) flush();
        }
        return;
      }

      const toolCallId = message.update.toolCallId;
      observedToolCalls.set(
        toolCallId,
        mergeObservedToolCall({
          previous: observedToolCalls.get(toolCallId),
          update: message.update,
        }),
      );
      if (!releasedToolCallIds.has(toolCallId) && hostToolCall != null) {
        suppressToolCallUpdate({ toolCallId });
      }
      if (suppressedToolCallIds.has(toolCallId)) {
        if (isTerminalToolUpdate(message)) {
          suppressedToolCallIds.delete(toolCallId);
          removeInvocationForToolCall({ invocations, toolCallId });
        }
        return;
      }
      if (releasedToolCallIds.has(toolCallId)) {
        emitSemanticUpdate({ message, rawUpdate: preservedUpdate });
        if (isTerminalToolUpdate(message))
          releasedToolCallIds.delete(toolCallId);
        return;
      }

      buffered.push({ message, rawUpdate: preservedUpdate });
      const candidate =
        candidates.get(toolCallId) ??
        ({
          toolCallId,
          order: ++nextCandidateOrder,
          evidence: [],
        } satisfies CorrelationCandidate);
      candidate.evidence.push(message.update, preservedUpdate);
      candidates.set(toolCallId, candidate);

      const tokenMatch = findTokenInvocation({
        value: preservedUpdate,
        invocations,
      });
      if (tokenMatch != null) {
        suppressCandidate({ candidate, invocation: tokenMatch });
      }
      reconcile();
      if (buffered.length >= MAX_BUFFERED_UPDATES) flush();
      else if (buffered.length > 0) scheduleFlush();
    },
    registerInvocation: ({ token, serverName, toolName, input, order }) => {
      const invocation: CorrelationInvocation = {
        token,
        serverName,
        toolName,
        inputFingerprint: canonicalFingerprint({ value: input }),
        order,
      };
      invocations.set(token, invocation);
      invocation.expiryTimer = setTimeout(
        () => deleteInvocation({ invocations, token }),
        CORRELATION_WINDOW_MS,
      );
      invocation.expiryTimer.unref?.();
      const tokenCandidate = [...candidates.values()].find(candidate =>
        candidate.evidence.some(value =>
          containsExactValue({ value, target: token }),
        ),
      );
      if (tokenCandidate != null) {
        suppressCandidate({ candidate: tokenCandidate, invocation });
      }
      reconcile();
    },
    applyHostToolCall: ({ toolCallId, hostToolCall }) => {
      if (hostToolCall == null || releasedToolCallIds.has(toolCallId)) return;
      if (suppressedToolCallIds.has(toolCallId)) return;
      suppressToolCallUpdate({ toolCallId });
    },
    claimHostToolPermission: async ({ toolCall }) => {
      const observedBeforeResolution = observedToolCalls.get(
        toolCall.toolCallId,
      );
      if (
        toolCall.status === 'completed' ||
        toolCall.status === 'failed' ||
        observedBeforeResolution?.status === 'completed' ||
        observedBeforeResolution?.status === 'failed' ||
        observedBeforeResolution?.rawInput === null
      ) {
        return undefined;
      }
      const [observedHostCall, permissionCall] = await Promise.all([
        hostToolCallResolver.getResolution({
          toolCallId: toolCall.toolCallId,
        }),
        hostToolCallResolver.resolveToolCall({ toolCall }),
      ]);
      const candidate = candidates.get(toolCall.toolCallId);
      const observed = observedToolCalls.get(toolCall.toolCallId);
      if (observed != null && observedHostCall != null) {
        if (
          hasConflictingHostToolPermission({
            toolCall,
            observed,
            call: observedHostCall,
            permissionCall,
            serverName: hostToolServerName,
          })
        ) {
          return undefined;
        }
        suppressToolCallUpdate({ toolCallId: toolCall.toolCallId });
        return observedHostCall;
      }
      const matches: HostToolCall[] = [];
      for (const permission of resolvePermissionHostToolCandidates({
        toolCall,
        permissionCall,
        serverName: hostToolServerName,
        toolNames: hostTools.map(tool => tool.name),
      })) {
        const matchesPermission =
          candidate == null
            ? permission.hasRequestIdentity
            : hasPortableEvidence({
                candidate,
                invocation: {
                  token: '',
                  serverName: hostToolServerName,
                  toolName: permission.toolName,
                  inputFingerprint: canonicalFingerprint({
                    value: permission.input,
                  }),
                  order: 0,
                },
              });
        if (matchesPermission) {
          matches.push({
            toolName: permission.toolName,
            input: permission.input,
          });
        }
      }
      if (matches.length !== 1) return undefined;
      suppressToolCallUpdate({ toolCallId: toolCall.toolCallId });
      return matches[0];
    },
    suppressToolCall: suppressToolCallUpdate,
    getToolCall: ({ toolCallId }) => observedToolCalls.get(toolCallId),
    isToolCallReleased: ({ toolCallId }) => releasedToolCallIds.has(toolCallId),
    deferFlush: () => {
      flushHolds += 1;
      let released = false;
      return {
        release: () => {
          if (released) return;
          released = true;
          flushHolds -= 1;
          if (flushHolds === 0 && flushPending) flush();
        },
      };
    },
    flush,
    removeInvocation: ({ token }) => {
      deleteInvocation({ invocations, token });
    },
    close: () => {
      flush();
      for (const invocation of invocations.values()) {
        if (invocation.expiryTimer != null) {
          clearTimeout(invocation.expiryTimer);
        }
      }
      invocations.clear();
      candidates.clear();
      suppressedToolCallIds.clear();
      releasedToolCallIds.clear();
      observedToolCalls.clear();
    },
  };
}

function hasConflictingHostToolPermission({
  toolCall,
  observed,
  call,
  permissionCall,
  serverName,
}: {
  toolCall: ToolCallUpdate;
  observed: ACPToolCall;
  call: HostToolCall;
  permissionCall: HostToolCall | undefined;
  serverName: string;
}): boolean {
  if (permissionCall != null) {
    return (
      permissionCall.toolName !== call.toolName ||
      canonicalFingerprint({ value: permissionCall.input }) !==
        canonicalFingerprint({ value: call.input })
    );
  }
  if (
    toolCall.name != null &&
    toolCall.name !== observed.name &&
    toolCall.name !== call.toolName &&
    !hasDelimitedPair({
      value: toolCall.name,
      serverName,
      toolName: call.toolName,
    })
  ) {
    return true;
  }
  if (toolCall.rawInput === undefined) return false;
  if (!isRecord(toolCall.rawInput)) return true;
  const fingerprint = canonicalFingerprint({ value: toolCall.rawInput });
  return (
    fingerprint !== canonicalFingerprint({ value: observed.rawInput }) &&
    fingerprint !== canonicalFingerprint({ value: call.input })
  );
}

function hasPortableEvidence({
  candidate,
  invocation,
}: {
  candidate: CorrelationCandidate;
  invocation: CorrelationInvocation;
}): boolean {
  let hasServerIdentity = false;
  let hasToolName = false;
  let hasInput = false;
  for (const evidence of candidate.evidence) {
    const metadata = getProperty({ value: evidence, property: '_meta' });
    const rawInput = getProperty({ value: evidence, property: 'rawInput' });
    const programmaticName = getProperty({
      value: evidence,
      property: 'name',
    });
    if (programmaticName === invocation.toolName) {
      hasToolName = true;
    }
    if (
      containsCombinedIdentity({
        value: [metadata, programmaticName],
        serverName: invocation.serverName,
        toolName: invocation.toolName,
      })
    ) {
      hasServerIdentity = true;
      hasToolName = true;
    }
    if (
      containsExactValue({
        value: [metadata, rawInput],
        target: invocation.serverName,
      })
    ) {
      hasServerIdentity = true;
    }
    if (
      programmaticName === invocation.toolName ||
      containsExactValue({
        value: [metadata, rawInput],
        target: invocation.toolName,
      })
    ) {
      hasToolName = true;
    }
    if (
      containsFingerprint({
        value: [metadata, rawInput],
        target: invocation.inputFingerprint,
      })
    ) {
      hasInput = true;
    }
  }
  return hasServerIdentity && hasToolName && hasInput;
}

function resolvePermissionHostToolCandidates({
  toolCall,
  permissionCall,
  serverName,
  toolNames,
}: {
  toolCall: ToolCallUpdate;
  permissionCall: HostToolCall | undefined;
  serverName: string;
  toolNames: ReadonlyArray<string>;
}): Array<{
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly hasRequestIdentity: boolean;
}> {
  if (permissionCall != null) {
    return [{ ...permissionCall, hasRequestIdentity: true }];
  }
  const rawInput = toolCall.rawInput;
  if (!isRecord(rawInput)) return [];
  return toolNames.map(toolName => ({
    toolName,
    input: rawInput,
    hasRequestIdentity: containsCombinedIdentity({
      value: [
        getProperty({ value: toolCall, property: 'title' }),
        getProperty({ value: toolCall, property: 'name' }),
        getProperty({ value: toolCall, property: '_meta' }),
      ],
      serverName,
      toolName,
    }),
  }));
}

function containsCombinedIdentity({
  value,
  serverName,
  toolName,
}: {
  value: unknown;
  serverName: string;
  toolName: string;
}): boolean {
  return containsString({
    value,
    matches: candidate =>
      hasDelimitedPair({ value: candidate, serverName, toolName }),
  });
}

function hasDelimitedPair({
  value,
  serverName,
  toolName,
}: {
  value: string;
  serverName: string;
  toolName: string;
}): boolean {
  if (serverName.length === 0 || toolName.length === 0) return false;
  let serverIndex = value.indexOf(serverName);
  while (serverIndex !== -1) {
    const beforeServer = serverIndex === 0 ? undefined : value[serverIndex - 1];
    const serverHasLeadingBoundary =
      beforeServer == null ||
      value.slice(0, serverIndex).endsWith('__') ||
      !/[A-Za-z0-9_-]/.test(beforeServer);
    const delimiterStart = serverIndex + serverName.length;
    let toolIndex = delimiterStart;
    while (toolIndex < value.length && !/[A-Za-z0-9-]/.test(value[toolIndex])) {
      toolIndex += 1;
    }
    const toolEnd = toolIndex + toolName.length;
    const afterTool = toolEnd === value.length ? undefined : value[toolEnd];
    const toolHasTrailingBoundary =
      afterTool == null ||
      value.startsWith('__', toolEnd) ||
      !/[A-Za-z0-9_-]/.test(afterTool);
    if (
      serverHasLeadingBoundary &&
      toolIndex > delimiterStart &&
      value.startsWith(toolName, toolIndex) &&
      toolHasTrailingBoundary
    ) {
      return true;
    }
    serverIndex = value.indexOf(serverName, serverIndex + 1);
  }
  return false;
}

function findTokenInvocation({
  value,
  invocations,
}: {
  value: unknown;
  invocations: ReadonlyMap<string, CorrelationInvocation>;
}): CorrelationInvocation | undefined {
  for (const invocation of invocations.values()) {
    if (containsExactValue({ value, target: invocation.token })) {
      return invocation;
    }
  }
}

function removeInvocationForToolCall({
  invocations,
  toolCallId,
}: {
  invocations: Map<string, CorrelationInvocation>;
  toolCallId: string;
}): void {
  for (const [token, invocation] of invocations) {
    if (invocation.toolCallId === toolCallId) {
      deleteInvocation({ invocations, token });
    }
  }
}

function deleteInvocation({
  invocations,
  token,
}: {
  invocations: Map<string, CorrelationInvocation>;
  token: string;
}): void {
  const invocation = invocations.get(token);
  if (invocation?.expiryTimer != null) clearTimeout(invocation.expiryTimer);
  invocations.delete(token);
}

function isToolUpdate(
  message: SessionUpdateMessage,
): message is SessionUpdateMessage & {
  readonly update: {
    readonly sessionUpdate: 'tool_call' | 'tool_call_update';
    readonly toolCallId: string;
    readonly status?: string | null;
  };
} {
  return (
    message.update.sessionUpdate === 'tool_call' ||
    message.update.sessionUpdate === 'tool_call_update'
  );
}

function containsExactValue({
  value,
  target,
}: {
  value: unknown;
  target: string;
}): boolean {
  return containsString({ value, matches: candidate => candidate === target });
}

function containsString({
  value,
  matches,
}: {
  value: unknown;
  matches: (candidate: string) => boolean;
}): boolean {
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') return matches(candidate);
    if (candidate == null || typeof candidate !== 'object') return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    const values = Array.isArray(candidate)
      ? candidate
      : Object.values(candidate);
    for (const item of values) {
      if (visit(item)) return true;
    }
    return false;
  };
  return visit(value);
}

function containsFingerprint({
  value,
  target,
}: {
  value: unknown;
  target: string;
}): boolean {
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate != null && typeof candidate === 'object') {
      if (canonicalFingerprint({ value: candidate }) === target) return true;
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      const values = Array.isArray(candidate)
        ? candidate
        : Object.values(candidate);
      for (const item of values) {
        if (visit(item)) return true;
      }
    }
    return false;
  };
  return visit(value);
}

function getProperty({
  value,
  property,
}: {
  value: unknown;
  property: string;
}): unknown {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return Reflect.get(value, property);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isTerminalToolUpdate(
  message: SessionUpdateMessage,
): message is SessionUpdateMessage & {
  readonly update: {
    readonly sessionUpdate: 'tool_call' | 'tool_call_update';
    readonly toolCallId: string;
    readonly status: 'completed' | 'failed';
  };
} {
  return (
    isToolUpdate(message) &&
    (message.update.status === 'completed' ||
      message.update.status === 'failed')
  );
}
