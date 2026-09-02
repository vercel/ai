import type { ApiEvent } from '@1jehuang/jcode-sdk';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type { JcodeExternalToolCallEvent } from './jcode-client';

type Usage = Extract<
  HarnessV1StreamPart,
  { readonly type: 'finish' }
>['totalUsage'];

interface PendingToolCall {
  input: string;
  name: string;
  emitted: boolean;
}

/** Mutable state for translating one Jcode turn. Create a fresh state per turn. */
export interface JcodeTranslatorState {
  readonly turnId: string;
  blockCounter: number;
  currentTextId?: string;
  currentReasoningId?: string;
  readonly tools: Map<string, PendingToolCall>;
  stepHadToolCall: boolean;
  totalUsage: Usage;
}

export function createJcodeTranslatorState(
  turnId: string | number = 1,
): JcodeTranslatorState {
  return {
    turnId: String(turnId),
    blockCounter: 0,
    tools: new Map(),
    stepHadToolCall: false,
    totalUsage: zeroUsage(),
  };
}

export function translateJcodeExternalToolCall(
  event: JcodeExternalToolCallEvent,
): HarnessV1StreamPart {
  return {
    type: 'tool-call',
    toolCallId: event.call_id,
    toolName: event.name,
    input: JSON.stringify(event.input) ?? 'null',
    providerExecuted: false,
    dynamic: false,
  };
}

export function translateJcodeExternalToolResult({
  toolCallId,
  toolName,
  output,
  isError,
}: {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
  readonly isError: boolean;
}): HarnessV1StreamPart {
  return {
    type: 'tool-result',
    toolCallId,
    toolName,
    result: output as Extract<
      HarnessV1StreamPart,
      { readonly type: 'tool-result' }
    >['result'],
    ...(isError ? { isError: true } : {}),
  };
}

function zeroUsage(): Usage {
  return {
    inputTokens: {
      total: 0,
      noCache: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
}

function usageFromEvent(
  event: Extract<ApiEvent, { readonly ev: 'token_usage' }>,
): Usage {
  const cacheRead = event.cache_read_input ?? 0;
  return {
    inputTokens: {
      total: event.input,
      noCache: Math.max(0, event.input - cacheRead),
      cacheRead,
      cacheWrite: 0,
    },
    outputTokens: {
      total: event.output,
      text: undefined,
      reasoning: undefined,
    },
  };
}

function addUsage(total: Usage, step: Usage): Usage {
  const addKnown = (
    left: number | undefined,
    right: number | undefined,
  ): number | undefined =>
    left == null || right == null ? undefined : left + right;
  return {
    inputTokens: {
      total: (total.inputTokens.total ?? 0) + (step.inputTokens.total ?? 0),
      noCache:
        (total.inputTokens.noCache ?? 0) + (step.inputTokens.noCache ?? 0),
      cacheRead:
        (total.inputTokens.cacheRead ?? 0) + (step.inputTokens.cacheRead ?? 0),
      cacheWrite:
        (total.inputTokens.cacheWrite ?? 0) +
        (step.inputTokens.cacheWrite ?? 0),
    },
    outputTokens: {
      total: (total.outputTokens.total ?? 0) + (step.outputTokens.total ?? 0),
      text: addKnown(total.outputTokens.text, step.outputTokens.text),
      reasoning: addKnown(
        total.outputTokens.reasoning,
        step.outputTokens.reasoning,
      ),
    },
  };
}

function closeText(state: JcodeTranslatorState): HarnessV1StreamPart[] {
  if (!state.currentTextId) return [];
  const id = state.currentTextId;
  state.currentTextId = undefined;
  return [{ type: 'text-end', id }];
}

function closeReasoning(state: JcodeTranslatorState): HarnessV1StreamPart[] {
  if (!state.currentReasoningId) return [];
  const id = state.currentReasoningId;
  state.currentReasoningId = undefined;
  return [{ type: 'reasoning-end', id }];
}

function closeBlocks(state: JcodeTranslatorState): HarnessV1StreamPart[] {
  return [...closeReasoning(state), ...closeText(state)];
}

function nextBlockId(
  state: JcodeTranslatorState,
  kind: 'text' | 'reasoning',
): string {
  state.blockCounter += 1;
  return `jcode-turn-${state.turnId}-${kind}-${state.blockCounter}`;
}

function emitToolCall(
  state: JcodeTranslatorState,
  callId: string,
): HarnessV1StreamPart[] {
  const tool = state.tools.get(callId);
  if (!tool || tool.emitted) return [];
  tool.emitted = true;
  state.stepHadToolCall = true;
  return [
    {
      type: 'tool-call',
      toolCallId: callId,
      toolName: tool.name,
      input: tool.input || '{}',
      providerExecuted: true,
      dynamic: true,
    },
  ];
}

/** Translate one Jcode API event into ordered harness stream parts. */
export function translateJcodeEvent(
  event: ApiEvent,
  state: JcodeTranslatorState,
): HarnessV1StreamPart[] {
  switch (event.ev) {
    case 'text_delta': {
      const parts = closeReasoning(state);
      if (!state.currentTextId) {
        state.currentTextId = nextBlockId(state, 'text');
        parts.push({ type: 'text-start', id: state.currentTextId });
      }
      parts.push({
        type: 'text-delta',
        id: state.currentTextId,
        delta: event.text,
      });
      return parts;
    }

    case 'reasoning_delta': {
      const parts = closeText(state);
      if (!state.currentReasoningId) {
        state.currentReasoningId = nextBlockId(state, 'reasoning');
        parts.push({ type: 'reasoning-start', id: state.currentReasoningId });
      }
      parts.push({
        type: 'reasoning-delta',
        id: state.currentReasoningId,
        delta: event.text,
      });
      return parts;
    }

    case 'reasoning_done':
      return closeReasoning(state);

    case 'tool_start':
      state.tools.set(event.call_id, {
        input: '',
        name: event.name,
        emitted: false,
      });
      return closeBlocks(state);

    case 'tool_input_delta': {
      const tool = state.tools.get(event.call_id);
      if (tool && !tool.emitted) tool.input += event.delta;
      return [];
    }

    case 'tool_exec': {
      const existing = state.tools.get(event.call_id);
      if (!existing) {
        state.tools.set(event.call_id, {
          input: '',
          name: event.name,
          emitted: false,
        });
      } else {
        existing.name = event.name;
      }
      return [...closeBlocks(state), ...emitToolCall(state, event.call_id)];
    }

    case 'tool_done': {
      const existing = state.tools.get(event.call_id);
      if (!existing) {
        state.tools.set(event.call_id, {
          input: '',
          name: event.name,
          emitted: false,
        });
      }
      const parts = [
        ...closeBlocks(state),
        ...emitToolCall(state, event.call_id),
      ];
      parts.push({
        type: 'tool-result',
        toolCallId: event.call_id,
        toolName: event.name,
        result: event.error ?? event.output,
        ...(event.error ? { isError: true } : {}),
      });
      state.tools.delete(event.call_id);
      return parts;
    }

    case 'token_usage': {
      const usage = usageFromEvent(event);
      state.totalUsage = addUsage(state.totalUsage, usage);
      const finishReason = state.stepHadToolCall ? 'tool-calls' : 'stop';
      state.stepHadToolCall = false;
      const pendingToolCalls = [...state.tools.keys()].flatMap(callId =>
        emitToolCall(state, callId),
      );
      return [
        ...closeBlocks(state),
        ...pendingToolCalls,
        {
          type: 'finish-step',
          finishReason: { unified: finishReason, raw: finishReason },
          usage,
        },
      ];
    }

    case 'compacted':
      return [
        ...closeBlocks(state),
        {
          type: 'compaction',
          trigger: 'auto',
          summary: event.message,
        },
      ];

    case 'turn_done':
      return [
        ...closeBlocks(state),
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'turn_done' },
          totalUsage: state.totalUsage,
        },
      ];

    case 'error':
      return [{ type: 'error', error: event }];

    default:
      return [{ type: 'raw', rawValue: event }];
  }
}
