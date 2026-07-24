import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import {
  emitLegacyPartDelta,
  emitLegacyTextPartUpdate,
  emitMissingFinalDelta,
  type OpenCodeEvent,
  type TranslationState,
} from './opencode-events';
import {
  legacyStepFinishPartToFinishStep,
  mapOpenCodeFinishReason,
} from './opencode-finish-step';
import { mapUsage } from './opencode-usage';

type Emit = (message: Record<string, unknown>) => void;

export function createEmitStreamEvent({
  state,
  emit,
  emitWarning,
  emitError,
  toWireToolName,
  nativeNameField,
  getHostToolName,
  authorizeHostToolCall,
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
  stripWorkDir: (file: string) => string;
  formatError: (error: unknown) => string;
}): (event: OpenCodeEvent) => void {
  return event => {
    const type = event.type;
    const props = event.properties ?? {};

    if (type === 'message.updated') {
      const info = props.info;
      if (isRecord(info)) {
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
        ...(props.provider?.metadata
          ? { providerMetadata: props.provider.metadata }
          : {}),
      });
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
      });
      return;
    }
    if (type === 'session.next.retried') {
      const error = props.error ?? event;
      if (isRecord(error) && error.isRetryable === false) {
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
  const event = legacyStepFinishPartToFinishStep(part);
  if (!event) return false;
  const id = isRecord(part) ? stringValue(part.id) : undefined;
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
}): void {
  if (!part || typeof part !== 'object') return;
  const toolPart = part as Record<string, any>;
  if (toolPart.type !== 'tool') return;
  const status = legacyToolPartStatus(toolPart);
  if (status !== 'running' && status !== 'completed' && status !== 'error') {
    return;
  }
  if (
    typeof toolPart.tool !== 'string' ||
    typeof toolPart.callID !== 'string'
  ) {
    return;
  }
  const callID = toolPart.callID;
  const rawToolName = toolPart.tool;
  const toolName = toWireToolName(rawToolName);
  state.toolNames.set(callID, { rawToolName, toolName });
  const hostToolName = getHostToolName(toolName, rawToolName);
  if (hostToolName) {
    if (status === 'running') {
      authorizeHostToolCall({
        callID,
        toolName: hostToolName,
        input: legacyToolPartInput(toolPart),
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
      ...(toolPart.provider?.metadata
        ? { providerMetadata: toolPart.provider.metadata }
        : {}),
    });
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
    });
  }
}

function legacyToolPartStatus(part: Record<string, any>): string | undefined {
  return typeof part.state === 'string'
    ? part.state
    : typeof part.state === 'object' && part.state !== null
      ? String(part.state.status ?? '')
      : undefined;
}

function legacyToolPartInput(
  part: Record<string, any>,
): Record<string, unknown> {
  const state =
    typeof part.state === 'object' && part.state !== null
      ? (part.state as Record<string, any>)
      : undefined;
  return {
    ...(isRecord(part.metadata) ? part.metadata : {}),
    ...(isRecord(state?.metadata) ? state.metadata : {}),
    ...(isRecord(state?.input) ? state.input : {}),
  };
}

function legacyToolPartOutput(part: Record<string, any>): unknown {
  const state =
    typeof part.state === 'object' && part.state !== null
      ? (part.state as Record<string, any>)
      : undefined;
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
  props: Record<string, any>,
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
  if (isRecord(error)) {
    const message =
      stringValue(error.message) ??
      (isRecord(error.data) ? stringValue(error.data.message) : undefined);
    const statusCode = error.statusCode;
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
