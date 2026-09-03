import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import {
  emitLegacyPartDelta,
  emitLegacyTextPartUpdate,
  emitMissingFinalDelta,
  openCodeMessageInfoFromValue,
  type TranslationState,
} from './opencode-events';
import {
  mapOpenCodeFinishReason,
  translateLegacyStepFinishPart,
} from './opencode-finish-step';
import { mapUsage } from './opencode-usage';
import {
  asOpenCodeObject,
  type OpenCodeEvent,
  type OpenCodeEventProperties,
} from './opencode-types';

type Emit = (message: Record<string, unknown>) => void;

type SubagentSession = {
  parentSessionId: string;
  sessionId: string;
};

export function createEmitStreamEvent({
  state,
  emit,
  emitWarning,
  emitError,
  toWireToolName,
  nativeNameField,
  getHostToolName,
  authorizeHostToolCall,
  onSubagentSession,
  isMcpToolName,
  stripWorkDir,
  formatError,
}: {
  state: TranslationState;
  emit: Emit;
  emitWarning: BridgeTurn['emitWarning'];
  emitError: BridgeTurn['emitError'];
  toWireToolName: (nativeName: string) => string;
  nativeNameField: (input: { nativeName: string; toolName: string }) => {
    nativeName?: string;
  };
  getHostToolName: (
    toolName: string,
    rawToolName: unknown,
  ) => string | undefined;
  authorizeHostToolCall: (input: {
    callID: string;
    toolName: string;
    input: unknown;
  }) => void;
  onSubagentSession?: (session: SubagentSession) => void;
  isMcpToolName: (toolName: string) => boolean;
  stripWorkDir: (file: string) => string;
  formatError: (error: unknown) => string;
}): (event: OpenCodeEvent) => void {
  return event => {
    const type = event.type;
    const props = event.properties ?? {};

    if (type === 'message.updated') {
      const info = openCodeMessageInfoFromValue(props.info);
      if (info) {
        const id = stringValue(info.id);
        const role = stringValue(info.role);
        if (id && role) state.messageRoles.set(id, role);
      }
      return;
    }

    if (type === 'message.part.delta') {
      emitLegacyPartDelta({ props, state, emit });
      return;
    }

    if (type === 'message.part.updated') {
      if (emitLegacyTextPartUpdate({ part: props.part, state, emit })) return;
      if (emitLegacyStepFinishPart({ part: props.part, state, emit })) return;
      emitLegacyToolPart({
        part: props.part,
        state,
        emit,
        toWireToolName,
        nativeNameField,
        getHostToolName,
        authorizeHostToolCall,
        onSubagentSession,
        isMcpToolName,
      });
      return;
    }

    if (type === 'session.next.text.started') {
      emit({ type: 'text-start', id: String(props.textID ?? event.id) });
      return;
    }
    if (type === 'session.next.text.delta') {
      const id = String(props.textID ?? event.id);
      state.textDeltas.set(
        id,
        `${state.textDeltas.get(id) ?? ''}${String(props.delta ?? '')}`,
      );
      emit({
        type: 'text-delta',
        id,
        delta: String(props.delta ?? ''),
      });
      return;
    }
    if (type === 'session.next.text.ended') {
      const id = String(props.textID ?? event.id);
      emitMissingFinalDelta({
        id,
        fullText: typeof props.text === 'string' ? props.text : undefined,
        emittedText: state.textDeltas.get(id) ?? '',
        emit,
        type: 'text-delta',
      });
      emit({ type: 'text-end', id });
      return;
    }
    if (type === 'session.next.reasoning.started') {
      emit({
        type: 'reasoning-start',
        id: String(props.reasoningID ?? event.id),
      });
      return;
    }
    if (type === 'session.next.reasoning.delta') {
      const id = String(props.reasoningID ?? event.id);
      state.reasoningDeltas.set(
        id,
        `${state.reasoningDeltas.get(id) ?? ''}${String(props.delta ?? '')}`,
      );
      emit({
        type: 'reasoning-delta',
        id,
        delta: String(props.delta ?? ''),
      });
      return;
    }
    if (type === 'session.next.reasoning.ended') {
      const id = String(props.reasoningID ?? event.id);
      emitMissingFinalDelta({
        id,
        fullText: typeof props.text === 'string' ? props.text : undefined,
        emittedText: state.reasoningDeltas.get(id) ?? '',
        emit,
        type: 'reasoning-delta',
      });
      emit({ type: 'reasoning-end', id });
      return;
    }
    if (type === 'session.next.shell.started') {
      const callID = String(props.callID ?? event.id);
      const command = String(props.command ?? '');
      state.shellCommands.set(callID, command);
      emit({
        type: 'tool-call',
        toolCallId: callID,
        toolName: 'bash',
        nativeName: 'bash',
        input: JSON.stringify({ command }),
        providerExecuted: true,
      });
      return;
    }
    if (type === 'session.next.shell.ended') {
      const callID = String(props.callID ?? event.id);
      emit({
        type: 'tool-result',
        toolCallId: callID,
        toolName: 'bash',
        result: {
          command: state.shellCommands.get(callID) ?? '',
          output: String(props.output ?? ''),
        },
      });
      return;
    }
    if (type === 'session.next.tool.input.delta') {
      const callID = String(props.callID ?? event.id);
      state.toolInputs.set(
        callID,
        `${state.toolInputs.get(callID) ?? ''}${String(props.delta ?? '')}`,
      );
      return;
    }
    if (type === 'session.next.tool.input.ended') {
      state.toolInputs.set(
        String(props.callID ?? event.id),
        String(props.text ?? ''),
      );
      return;
    }
    if (type === 'session.next.tool.called') {
      const callID = String(props.callID ?? event.id);
      const rawToolName = String(props.tool ?? 'unknown');
      if (rawToolName === 'StructuredOutput' || rawToolName === 'question') {
        return;
      }
      const toolName = toWireToolName(rawToolName);
      state.toolNames.set(callID, { rawToolName, toolName });
      const hostToolName = getHostToolName(toolName, props.tool);
      if (hostToolName) {
        authorizeHostToolCall({
          callID,
          toolName: hostToolName,
          input: props.input ?? parseToolInput(state, props),
        });
        return;
      }
      emit({
        type: 'tool-call',
        toolCallId: callID,
        toolName,
        ...nativeNameField({ nativeName: rawToolName, toolName }),
        input: JSON.stringify(props.input ?? parseToolInput(state, props)),
        providerExecuted: true,
        ...(isMcpToolName(rawToolName) ? { dynamic: true } : {}),
        ...(props.provider?.metadata
          ? { providerMetadata: props.provider.metadata }
          : {}),
      });
      if (isMcpToolName(rawToolName)) state.dynamicToolCallIds.add(callID);
      return;
    }
    if (
      type === 'session.next.tool.success' ||
      type === 'session.next.tool.failed'
    ) {
      const callID = String(props.callID ?? event.id);
      const cachedTool = state.toolNames.get(callID);
      const rawToolName =
        cachedTool?.rawToolName ??
        String((props as { tool?: unknown }).tool ?? '');
      if (rawToolName === 'StructuredOutput' || rawToolName === 'question') {
        return;
      }
      const toolName =
        cachedTool?.toolName ?? toWireToolName(rawToolName || 'unknown');
      if (getHostToolName(toolName, rawToolName)) return;
      emit({
        type: 'tool-result',
        toolCallId: callID,
        toolName,
        result:
          props.result ??
          props.structured ??
          ('content' in props ? props.content : null) ??
          null,
        ...(type === 'session.next.tool.failed' ? { isError: true } : {}),
        ...(state.dynamicToolCallIds.delete(callID) ? { dynamic: true } : {}),
      });
      return;
    }
    if (type === 'session.next.retried') {
      const error = props.error ?? event;
      if (openCodeErrorFromValue(error)?.isRetryable === false) {
        emitError({
          error,
          message: 'OpenCode session retry failed',
        });
      } else {
        emitWarning({ message: nextRetryEventMessage({ event, formatError }) });
      }
      return;
    }
    if (type === 'session.next.step.ended') {
      closeLegacyOpenParts({ state, emit });
      state.turnUsage = mapUsage(props.tokens);
      emit({
        type: 'finish-step',
        finishReason: {
          unified: mapOpenCodeFinishReason(String(props.finish ?? 'stop')),
          raw: String(props.finish ?? 'stop'),
        },
        usage: state.turnUsage,
        ...(typeof props.cost === 'number'
          ? { harnessMetadata: { opencode: { cost: props.cost } } }
          : {}),
      });
      return;
    }
    if (type === 'session.next.compaction.ended') {
      emit({
        type: 'compaction',
        trigger: props.reason === 'auto' ? 'auto' : 'manual',
        summary: String(props.text ?? ''),
        harnessMetadata: {
          opencode: {
            recent: String(props.recent ?? ''),
          },
        },
      });
      return;
    }
    if (type === 'file.edited') {
      emit({
        type: 'file-change',
        event: 'modify',
        path: stripWorkDir(String(props.file ?? '')),
      });
      return;
    }
    if (type === 'session.error' || type === 'session.next.step.failed') {
      const error = props.error ?? event;
      emitError({
        error,
        message:
          type === 'session.error'
            ? 'OpenCode session error'
            : 'OpenCode step failed',
      });
    }
  };
}

function closeLegacyOpenParts({
  state,
  emit,
}: {
  state: TranslationState;
  emit: Emit;
}): void {
  for (const id of state.legacyReasoningPartIds) {
    emit({ type: 'reasoning-end', id });
    state.reasoningDeltas.delete(id);
  }
  state.legacyReasoningPartIds.clear();
  for (const id of state.legacyTextPartIds) {
    emit({ type: 'text-end', id });
    state.textDeltas.delete(id);
  }
  state.legacyTextPartIds.clear();
}

function emitLegacyStepFinishPart({
  part,
  state,
  emit,
}: {
  part: unknown;
  state: TranslationState;
  emit: Emit;
}): boolean {
  const translated = translateLegacyStepFinishPart(part);
  if (!translated) return false;
  const { event, partId: id } = translated;
  if (id) {
    if (state.legacyStepFinishPartIds.has(id)) return true;
    state.legacyStepFinishPartIds.add(id);
  }
  closeLegacyOpenParts({ state, emit });
  state.turnUsage = event.usage as Record<string, unknown>;
  emit(event);
  return true;
}

function emitLegacyToolPart({
  part,
  state,
  emit,
  toWireToolName,
  nativeNameField,
  getHostToolName,
  authorizeHostToolCall,
  onSubagentSession,
  isMcpToolName,
}: {
  part: unknown;
  state: TranslationState;
  emit: Emit;
  toWireToolName: (nativeName: string) => string;
  nativeNameField: (input: { nativeName: string; toolName: string }) => {
    nativeName?: string;
  };
  getHostToolName: (
    toolName: string,
    rawToolName: unknown,
  ) => string | undefined;
  authorizeHostToolCall: (input: {
    callID: string;
    toolName: string;
    input: unknown;
  }) => void;
  onSubagentSession?: (session: SubagentSession) => void;
  isMcpToolName: (toolName: string) => boolean;
}): void {
  const toolPart = legacyToolPartFromValue(part);
  if (!toolPart) return;
  const status = toolPart.status;
  if (status !== 'running' && status !== 'completed' && status !== 'error') {
    return;
  }
  const callID = toolPart.callID;
  const rawToolName = toolPart.tool;
  if (rawToolName === 'StructuredOutput' || rawToolName === 'question') return;
  const toolName = toWireToolName(rawToolName);
  if (toolName === 'agent') {
    const metadata = {
      ...(toolPart.metadata ?? {}),
      ...(toolPart.state?.metadata ?? {}),
    };
    const parentSessionId = stringValue(metadata.parentSessionId);
    const sessionId = stringValue(metadata.sessionId);
    if (parentSessionId && sessionId) {
      onSubagentSession?.({ parentSessionId, sessionId });
    }
  }
  state.toolNames.set(callID, { rawToolName, toolName });
  const hostToolName = getHostToolName(toolName, rawToolName);
  if (hostToolName) {
    if (status === 'running') {
      authorizeHostToolCall({
        callID,
        toolName: hostToolName,
        input: toolPart.state?.input ?? {},
      });
    }
    return;
  }
  if (!state.toolCallsEmitted.has(callID)) {
    state.toolCallsEmitted.add(callID);
    emit({
      type: 'tool-call',
      toolCallId: callID,
      toolName,
      ...nativeNameField({ nativeName: rawToolName, toolName }),
      input: JSON.stringify(legacyToolPartInput(toolPart)),
      providerExecuted: true,
      ...(isMcpToolName(rawToolName) ? { dynamic: true } : {}),
      ...(toolPart.providerMetadata
        ? { providerMetadata: toolPart.providerMetadata }
        : {}),
    });
    if (isMcpToolName(rawToolName)) state.dynamicToolCallIds.add(callID);
  }
  if (
    (status === 'completed' || status === 'error') &&
    !state.toolResultsEmitted.has(callID)
  ) {
    state.toolResultsEmitted.add(callID);
    emit({
      type: 'tool-result',
      toolCallId: callID,
      toolName,
      result: legacyToolPartOutput(toolPart),
      ...(status === 'error' ? { isError: true } : {}),
      ...(state.dynamicToolCallIds.delete(callID) ? { dynamic: true } : {}),
    });
  }
}

function legacyToolPartInput(part: LegacyToolPart): Record<string, unknown> {
  return {
    ...(part.metadata ?? {}),
    ...(part.state?.metadata ?? {}),
    ...(part.state?.input ?? {}),
  };
}

function legacyToolPartOutput(part: LegacyToolPart): unknown {
  const state = part.state;
  if (state?.status === 'error') {
    return state.error ?? part.error ?? state.result ?? 'tool failed';
  }
  return (
    state?.output ??
    state?.result ??
    state?.structured ??
    state?.content ??
    null
  );
}

function parseToolInput(
  state: TranslationState,
  props: OpenCodeEventProperties,
): unknown {
  const text = state.toolInputs.get(String(props.callID ?? ''));
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { input: text };
  }
}

function nextRetryEventMessage({
  event,
  formatError,
}: {
  event: OpenCodeEvent;
  formatError: (error: unknown) => string;
}): string {
  const props = event.properties ?? {};
  const details: string[] = [];
  if (typeof props.attempt === 'number') {
    details.push(`attempt ${props.attempt}`);
  }
  const error = props.error;
  const errorDetails = openCodeErrorFromValue(error);
  if (errorDetails) {
    const message =
      stringValue(errorDetails.message) ??
      stringValue(errorDetails.data?.message);
    const statusCode = errorDetails.statusCode;
    if (typeof statusCode === 'number') {
      details.push(`HTTP ${statusCode}`);
    }
    if (message) details.push(message);
  } else if (error != null) {
    details.push(formatError(error));
  }
  return details.length > 0
    ? `OpenCode session retry: ${details.join('; ')}`
    : 'OpenCode session retry';
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

type LegacyToolState = {
  status?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  output?: unknown;
  result?: unknown;
  structured?: unknown;
  content?: unknown;
  error?: unknown;
};

type LegacyToolPart = {
  type: 'tool';
  callID: string;
  tool: string;
  status?: string;
  state?: LegacyToolState;
  metadata?: Record<string, unknown>;
  providerMetadata?: unknown;
  error?: unknown;
};

function legacyToolPartFromValue(value: unknown): LegacyToolPart | undefined {
  const part = asOpenCodeObject(value);
  if (
    !part ||
    part.type !== 'tool' ||
    typeof part.tool !== 'string' ||
    typeof part.callID !== 'string'
  ) {
    return undefined;
  }

  const stateObject = asOpenCodeObject(part.state);
  const provider = asOpenCodeObject(part.provider);
  const state = stateObject
    ? {
        status: stringValue(stateObject.status),
        input: asOpenCodeObject(stateObject.input),
        metadata: asOpenCodeObject(stateObject.metadata),
        output: stateObject.output,
        result: stateObject.result,
        structured: stateObject.structured,
        content: stateObject.content,
        error: stateObject.error,
      }
    : undefined;

  return {
    type: 'tool',
    callID: part.callID,
    tool: part.tool,
    status:
      typeof part.state === 'string'
        ? part.state
        : (state?.status ?? undefined),
    state,
    metadata: asOpenCodeObject(part.metadata),
    providerMetadata: provider?.metadata,
    error: part.error,
  };
}

type OpenCodeErrorDetails = {
  isRetryable?: unknown;
  message?: unknown;
  statusCode?: unknown;
  data?: { message?: unknown };
};

function openCodeErrorFromValue(
  value: unknown,
): OpenCodeErrorDetails | undefined {
  const error = asOpenCodeObject(value);
  if (!error) return undefined;
  const data = asOpenCodeObject(error.data);
  return {
    isRetryable: error.isRetryable,
    message: error.message,
    statusCode: error.statusCode,
    data: data ? { message: data.message } : undefined,
  };
}
