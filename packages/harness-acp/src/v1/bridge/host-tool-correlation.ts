import type {
  ActiveSessionMessage,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type { ACPToolCall } from '../../acp-tool-call';

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
}: {
  emitSemanticUpdate: (options: {
    message: SessionUpdateMessage;
    rawUpdate: unknown;
  }) => void;
  emitRawUpdate: (options: { rawUpdate: unknown }) => void;
  hostToolServerName: string;
  hostTools: ReadonlyArray<{ readonly name: string }>;
}): {
  update(options: { message: SessionUpdateMessage; rawUpdate?: unknown }): void;
  registerInvocation(options: {
    token: string;
    serverName: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
    order: number;
  }): void;
  claimHostToolPermission(options: { toolCall: ToolCallUpdate }): boolean;
  suppressToolCall(options: { toolCallId: string }): void;
  getToolCall(options: { toolCallId: string }): ACPToolCall | undefined;
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

  const flush = () => {
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
    flushTimer = setTimeout(flush, CORRELATION_WINDOW_MS);
    flushTimer.unref?.();
  };

  const suppressCandidate = ({
    candidate,
    invocation,
  }: {
    candidate: CorrelationCandidate;
    invocation: CorrelationInvocation;
  }) => {
    invocation.toolCallId = candidate.toolCallId;
    suppressedToolCallIds.add(candidate.toolCallId);
    candidates.delete(candidate.toolCallId);
    deleteInvocation({ invocations, token: invocation.token });
  };

  const suppressToolCallUpdate = ({ toolCallId }: { toolCallId: string }) => {
    suppressedToolCallIds.add(toolCallId);
    candidates.delete(toolCallId);
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
    update: ({ message, rawUpdate }) => {
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
    claimHostToolPermission: ({ toolCall }) => {
      const candidate = candidates.get(toolCall.toolCallId);
      const matches = hostTools.filter(({ name }) => {
        const permission = resolvePermissionHostTool({
          toolCall,
          serverName: hostToolServerName,
          toolName: name,
        });
        if (permission == null) return false;
        if (candidate == null) return permission.hasRequestIdentity;
        return hasPortableEvidence({
          candidate,
          invocation: {
            token: '',
            serverName: hostToolServerName,
            toolName: name,
            inputFingerprint: canonicalFingerprint({
              value: permission.input,
            }),
            order: 0,
          },
        });
      });
      if (matches.length !== 1) return false;
      suppressToolCallUpdate({ toolCallId: toolCall.toolCallId });
      return true;
    },
    suppressToolCall: suppressToolCallUpdate,
    getToolCall: ({ toolCallId }) => observedToolCalls.get(toolCallId),
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

function mergeObservedToolCall({
  previous,
  update,
}: {
  previous: ACPToolCall | undefined;
  update: ToolCallUpdate;
}): ACPToolCall {
  return {
    toolCallId: update.toolCallId,
    title: update.title ?? previous?.title ?? `Tool ${update.toolCallId}`,
    ...(update.kind == null ? {} : { kind: update.kind }),
    ...(update.status == null ? {} : { status: update.status }),
    ...(update.content == null ? {} : { content: update.content }),
    ...(update.locations == null ? {} : { locations: update.locations }),
    ...(update.rawInput === undefined ? {} : { rawInput: update.rawInput }),
    ...(update.rawOutput === undefined ? {} : { rawOutput: update.rawOutput }),
    ...(update._meta === undefined ? {} : { _meta: update._meta }),
  };
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
    const deferredToolName = getProperty({
      value: rawInput,
      property: 'tool_name',
    });
    const deferredToolInput = getProperty({
      value: rawInput,
      property: 'tool_input',
    });
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
      typeof deferredToolName === 'string' &&
      isRecord(deferredToolInput) &&
      hasDelimitedPair({
        value: deferredToolName,
        serverName: invocation.serverName,
        toolName: invocation.toolName,
      })
    ) {
      hasServerIdentity = true;
      hasToolName = true;
      if (
        canonicalFingerprint({ value: deferredToolInput }) ===
        invocation.inputFingerprint
      ) {
        hasInput = true;
      }
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

function resolvePermissionHostTool({
  toolCall,
  serverName,
  toolName,
}: {
  toolCall: ToolCallUpdate;
  serverName: string;
  toolName: string;
}):
  | {
      readonly input: Readonly<Record<string, unknown>>;
      readonly hasRequestIdentity: boolean;
    }
  | undefined {
  if (!isRecord(toolCall.rawInput)) return undefined;
  const deferredToolName = getProperty({
    value: toolCall.rawInput,
    property: 'tool_name',
  });
  const deferredToolInput = getProperty({
    value: toolCall.rawInput,
    property: 'tool_input',
  });
  if (
    hasOwnProperty({ value: toolCall.rawInput, property: 'tool_name' }) &&
    hasOwnProperty({ value: toolCall.rawInput, property: 'tool_input' })
  ) {
    if (
      typeof deferredToolName !== 'string' ||
      !isRecord(deferredToolInput) ||
      !hasDelimitedPair({
        value: deferredToolName,
        serverName,
        toolName,
      })
    ) {
      return undefined;
    }
    return {
      input: deferredToolInput,
      hasRequestIdentity: true,
    };
  }
  return {
    input: toolCall.rawInput,
    hasRequestIdentity: containsCombinedIdentity({
      value: [
        getProperty({ value: toolCall, property: 'title' }),
        getProperty({ value: toolCall, property: 'name' }),
        getProperty({ value: toolCall, property: '_meta' }),
      ],
      serverName,
      toolName,
    }),
  };
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
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') {
      return hasDelimitedPair({ value: candidate, serverName, toolName });
    }
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
  return undefined;
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
  const seen = new Set<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === target) return true;
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

function canonicalFingerprint({ value }: { value: unknown }): string {
  return JSON.stringify(canonicalizeJSON({ value }));
}

function canonicalizeJSON({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeJSON({ value: item }));
  }
  if (value == null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .map(key => [
        key,
        canonicalizeJSON({
          value: (value as Record<string, unknown>)[key],
        }),
      ]),
  );
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

function hasOwnProperty({
  value,
  property,
}: {
  value: Readonly<Record<string, unknown>>;
  property: string;
}): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
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
