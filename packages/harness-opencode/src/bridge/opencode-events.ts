import {
  asOpenCodeObject,
  type OpenCodeEvent,
  type OpenCodeEventProperties,
  type OpenCodeMessageInfo,
} from './opencode-types';

type Emit = (msg: Record<string, unknown>) => void;

export type TranslationState = {
  streamStarted: boolean;
  textDeltas: Map<string, string>;
  reasoningDeltas: Map<string, string>;
  toolInputs: Map<string, string>;
  toolNames: Map<string, { rawToolName: string; toolName: string }>;
  toolCallsEmitted: Set<string>;
  toolResultsEmitted: Set<string>;
  hostToolCallsAuthorized: Set<string>;
  shellCommands: Map<string, string>;
  messageRoles: Map<string, string>;
  turnUsage: Record<string, unknown> | undefined;
  legacyTextPartIds: Set<string>;
  legacyReasoningPartIds: Set<string>;
  legacyStepFinishPartIds: Set<string>;
  dynamicToolCallIds: Set<string>;
};

export function createTranslationState(): TranslationState {
  return {
    streamStarted: false,
    textDeltas: new Map(),
    reasoningDeltas: new Map(),
    toolInputs: new Map(),
    toolNames: new Map(),
    toolCallsEmitted: new Set(),
    toolResultsEmitted: new Set(),
    hostToolCallsAuthorized: new Set(),
    shellCommands: new Map(),
    messageRoles: new Map(),
    turnUsage: undefined,
    legacyTextPartIds: new Set(),
    legacyReasoningPartIds: new Set(),
    legacyStepFinishPartIds: new Set(),
    dynamicToolCallIds: new Set(),
  };
}

export function emitOpenCodeStreamStart({
  info,
  state,
  emit,
}: {
  info: unknown;
  state: TranslationState;
  emit: Emit;
}): void {
  if (state.streamStarted) return;
  const message = openCodeMessageInfoFromValue(info);
  if (!message) return;
  if (message.role !== 'assistant' && message.type !== 'assistant') return;
  const providerID = stringValue(message.providerID);
  const modelID = stringValue(message.modelID);
  const modelId =
    providerID && modelID ? `${providerID}/${modelID}` : undefined;

  state.streamStarted = true;
  emit({ type: 'stream-start', ...(modelId ? { modelId } : {}) });
}

export function unwrapOpenCodeEvent(
  rawEvent: unknown,
): OpenCodeEvent | undefined {
  const raw = asOpenCodeObject(rawEvent);
  if (!raw) return undefined;
  if (raw.type === 'sync' && raw.syncEvent) {
    const sync = asOpenCodeObject(raw.syncEvent);
    if (!sync) return undefined;
    return {
      id: String(sync.id ?? raw.id ?? ''),
      type: stripSyncVersion(String(sync.type ?? '')),
      properties: openCodeEventPropertiesFromValue(sync.data) ?? {},
    };
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    type: typeof raw.type === 'string' ? stripSyncVersion(raw.type) : undefined,
    properties:
      openCodeEventPropertiesFromValue(raw.properties) ??
      openCodeEventPropertiesFromValue(raw.data) ??
      {},
  };
}

export function getOpenCodeEventSessionId(
  event: OpenCodeEvent,
): string | undefined {
  const props = event.properties;
  if (!props) return undefined;
  if (typeof props.sessionID === 'string') return props.sessionID;
  if (typeof props.sessionId === 'string') return props.sessionId;
  if (event.type?.startsWith('session.') && typeof props.id === 'string') {
    return props.id;
  }
  const info = asOpenCodeObject(props.info);
  if (typeof info?.sessionID === 'string') return info.sessionID;
  if (
    (event.type === 'session.created' ||
      event.type === 'session.updated' ||
      event.type === 'session.deleted') &&
    typeof info?.id === 'string'
  ) {
    return info.id;
  }
  const part = props.part;
  const partObject = asOpenCodeObject(part);
  if (typeof partObject?.sessionID === 'string') return partObject.sessionID;
  return undefined;
}

export function isStepSettlementEvent(event: OpenCodeEvent): boolean {
  return (
    event.type === 'session.next.step.ended' ||
    event.type === 'session.next.step.failed' ||
    event.type === 'session.error'
  );
}

export function emitMissingFinalDelta({
  id,
  fullText,
  emittedText,
  emit,
  type,
}: {
  id: string;
  fullText: string | undefined;
  emittedText: string;
  emit: (msg: Record<string, unknown>) => void;
  type: 'text-delta' | 'reasoning-delta';
}): void {
  if (
    !fullText ||
    fullText === emittedText ||
    !fullText.startsWith(emittedText)
  ) {
    return;
  }
  emit({ type, id, delta: fullText.slice(emittedText.length) });
}

/**
 * Translates an OpenCode `message.part.delta` event (a streaming text or
 * reasoning delta) into legacy stream parts.
 */
export function emitLegacyPartDelta({
  props,
  state,
  emit,
}: {
  props: Record<string, unknown>;
  state: TranslationState;
  emit: Emit;
}): void {
  const field = String(props.field ?? '');
  const delta = String(props.delta ?? '');
  if (!delta) return;
  const messageID = stringValue(props.messageID);
  if (messageID && state.messageRoles.get(messageID) === 'user') return;
  if (field === 'text') {
    const id = legacyPartId({ value: props, fallback: 'legacy-text' });
    // OpenCode publishes reasoning deltas with field:"text". If this id was
    // already announced as a reasoning part, route it to reasoning so it is not
    // duplicated as a text part.
    if (state.legacyReasoningPartIds.has(id)) {
      state.reasoningDeltas.set(
        id,
        `${state.reasoningDeltas.get(id) ?? ''}${delta}`,
      );
      emit({ type: 'reasoning-delta', id, delta });
      return;
    }
    startLegacyPart({ ids: state.legacyTextPartIds, id, emit, type: 'text' });
    state.textDeltas.set(id, `${state.textDeltas.get(id) ?? ''}${delta}`);
    emit({ type: 'text-delta', id, delta });
    return;
  }
  if (field === 'reasoning') {
    const id = legacyPartId({ value: props, fallback: 'legacy-reasoning' });
    startLegacyPart({
      ids: state.legacyReasoningPartIds,
      id,
      emit,
      type: 'reasoning',
    });
    state.reasoningDeltas.set(
      id,
      `${state.reasoningDeltas.get(id) ?? ''}${delta}`,
    );
    emit({ type: 'reasoning-delta', id, delta });
  }
}

/**
 * Translates an OpenCode `message.part.updated` event for a text or reasoning
 * part. Returns `true` when it handled the part.
 */
export function emitLegacyTextPartUpdate({
  part,
  state,
  emit,
}: {
  part: unknown;
  state: TranslationState;
  emit: Emit;
}): boolean {
  const textPart = legacyTextPartFromValue(part);
  if (!textPart) return false;
  const id = stringValue(textPart.id);
  if (!id) return true;

  const messageID = stringValue(textPart.messageID);
  if (messageID && state.messageRoles.get(messageID) === 'user') return true;

  const isReasoning = textPart.type === 'reasoning';
  const ids = isReasoning
    ? state.legacyReasoningPartIds
    : state.legacyTextPartIds;
  const deltaMap = isReasoning ? state.reasoningDeltas : state.textDeltas;
  const deltaType = isReasoning ? 'reasoning-delta' : 'text-delta';
  const text = typeof textPart.text === 'string' ? textPart.text : undefined;

  startLegacyPart({
    ids,
    id,
    emit,
    type: isReasoning ? 'reasoning' : 'text',
  });

  if (text !== undefined) {
    emitMissingFinalDelta({
      id,
      fullText: text,
      emittedText: deltaMap.get(id) ?? '',
      emit,
      type: deltaType,
    });
    deltaMap.set(id, text);
  }

  if (textPart.time?.end != null) {
    ids.delete(id);
    deltaMap.delete(id);
    emit({ type: isReasoning ? 'reasoning-end' : 'text-end', id });
  }

  return true;
}

function stripSyncVersion(type: string): string {
  return type.replace(/\.\d+$/, '');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function legacyPartId({
  value,
  fallback,
}: {
  value: Record<string, unknown>;
  fallback: string;
}): string {
  return stringValue(value.partID) ?? stringValue(value.id) ?? fallback;
}

function startLegacyPart({
  ids,
  id,
  emit,
  type,
}: {
  ids: Set<string>;
  id: string;
  emit: Emit;
  type: 'text' | 'reasoning';
}): void {
  if (ids.has(id)) return;
  ids.add(id);
  emit({ type: `${type}-start`, id });
}

export function openCodeMessageInfoFromValue(
  value: unknown,
): OpenCodeMessageInfo | undefined {
  return asOpenCodeObject(value) as OpenCodeMessageInfo | undefined;
}

function openCodeEventPropertiesFromValue(
  value: unknown,
): OpenCodeEventProperties | undefined {
  return asOpenCodeObject(value) as OpenCodeEventProperties | undefined;
}

type LegacyTextPart = {
  type: 'text' | 'reasoning';
  id?: unknown;
  messageID?: unknown;
  text?: unknown;
  time?: { end?: unknown };
};

function legacyTextPartFromValue(value: unknown): LegacyTextPart | undefined {
  const part = asOpenCodeObject(value);
  if (!part || (part.type !== 'text' && part.type !== 'reasoning')) {
    return undefined;
  }
  return {
    type: part.type,
    id: part.id,
    messageID: part.messageID,
    text: part.text,
    time: asOpenCodeObject(part.time),
  };
}
