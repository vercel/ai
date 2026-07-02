import type { HarnessV1BuiltinToolFiltering } from '@ai-sdk/harness';
import { randomUUID } from 'node:crypto';
import {
  getCursorBuiltinToolFilteringDenialReason,
  isCursorBuiltinToolIncluded,
  toCursorCommonName,
} from './cursor-tool-filtering';

export {
  CURSOR_NATIVE_TO_COMMON,
  toCursorCommonName,
} from './cursor-tool-filtering';

export type CursorStreamEvent = {
  type: string;
  agent_id?: string;
  run_id?: string;
  text?: string;
  call_id?: string;
  name?: string;
  status?: 'running' | 'completed' | 'error';
  args?: unknown;
  result?: unknown;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  model?: { id?: string };
};

export type CursorEmit = (msg: Record<string, unknown>) => void;

export type CursorTranslatorState = {
  readonly hostToolNames: ReadonlySet<string>;
  readonly builtinToolFiltering: HarnessV1BuiltinToolFiltering | undefined;
  textBlockId: string | undefined;
  reasoningBlockId: string | undefined;
  emittedToolCalls: Set<string>;
  deniedToolCalls: Set<string>;
  streamStarted: boolean;
};

export function createCursorTranslatorState(
  hostToolNames: ReadonlyArray<string> = [],
  builtinToolFiltering?: HarnessV1BuiltinToolFiltering,
): CursorTranslatorState {
  return {
    hostToolNames: new Set(hostToolNames),
    builtinToolFiltering,
    textBlockId: undefined,
    reasoningBlockId: undefined,
    emittedToolCalls: new Set(),
    deniedToolCalls: new Set(),
    streamStarted: false,
  };
}

export function translateCursorStreamEvent(
  event: CursorStreamEvent,
  state: CursorTranslatorState,
  emit: CursorEmit,
): void {
  switch (event.type) {
    case 'system': {
      if (!state.streamStarted) {
        state.streamStarted = true;
        emit({
          type: 'stream-start',
          ...(event.model?.id ? { modelId: event.model.id } : {}),
        });
      }
      return;
    }
    case 'assistant': {
      const content = event.message?.content ?? [];
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          const id = state.textBlockId ?? randomUUID();
          if (!state.textBlockId) {
            state.textBlockId = id;
            emit({ type: 'text-start', id });
          }
          if (block.text.length > 0) {
            emit({ type: 'text-delta', id, delta: block.text });
          }
        }
      }
      return;
    }
    case 'thinking': {
      if (typeof event.text !== 'string') return;
      const id = state.reasoningBlockId ?? randomUUID();
      if (!state.reasoningBlockId) {
        state.reasoningBlockId = id;
        emit({ type: 'reasoning-start', id });
      }
      if (event.text.length > 0) {
        emit({ type: 'reasoning-delta', id, delta: event.text });
      }
      return;
    }
    case 'tool_call': {
      const callId = event.call_id ?? randomUUID();
      const nativeName = event.name ?? 'unknown';
      const commonName = toCursorCommonName(nativeName);
      const isHostTool = state.hostToolNames.has(nativeName);

      if (event.status === 'running') {
        if (state.emittedToolCalls.has(callId)) return;
        state.emittedToolCalls.add(callId);
        const isInactiveBuiltin =
          !isHostTool &&
          !isCursorBuiltinToolIncluded({
            nativeName,
            hostToolNames: state.hostToolNames,
            toolFiltering: state.builtinToolFiltering,
          });
        emit({
          type: 'tool-call',
          toolCallId: callId,
          toolName: commonName,
          nativeName,
          input: safeStringify(event.args ?? {}),
          providerExecuted: !isHostTool,
        });
        if (isInactiveBuiltin) {
          state.deniedToolCalls.add(callId);
          emit({
            type: 'tool-result',
            toolCallId: callId,
            toolName: commonName,
            result: getCursorBuiltinToolFilteringDenialReason({ nativeName }),
            isError: true,
          });
        }
        return;
      }

      if (state.deniedToolCalls.has(callId)) return;

      if (event.status === 'completed' || event.status === 'error') {
        emit({
          type: 'tool-result',
          toolCallId: callId,
          toolName: commonName,
          result: event.result ?? null,
          ...(event.status === 'error' ? { isError: true } : {}),
        });
        return;
      }
      return;
    }
    default:
      return;
  }
}

export function finalizeCursorTextBlocks(
  state: CursorTranslatorState,
  emit: CursorEmit,
): void {
  if (state.textBlockId) {
    emit({ type: 'text-end', id: state.textBlockId });
    state.textBlockId = undefined;
  }
  if (state.reasoningBlockId) {
    emit({ type: 'reasoning-end', id: state.reasoningBlockId });
    state.reasoningBlockId = undefined;
  }
}

export function defaultCursorUsage(): Record<string, unknown> {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
}
