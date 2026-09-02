import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type { AgentRuntimeEvent, AgentToolResult } from '@cline/agents';
import {
  mapModelFinishReason,
  toToolResultValue,
  usageFromMessageMetrics,
} from './cline-utils';

type FinishStepPart = Extract<
  HarnessV1StreamPart,
  { readonly type: 'finish-step' }
>;

/**
 * Per-turn translator state. Tracks open text/reasoning blocks (the Cline
 * runtime streams flat deltas; the harness contract wants explicit
 * start/delta/end block framing) and which tool calls have already been
 * surfaced — an approval request can emit a `tool-call` part before the
 * runtime's own `tool-started` event fires for it. Cline emits the assistant
 * message before executing that iteration's tools, so the step boundary is
 * buffered until `turn-finished` confirms that those tools have settled.
 */
export interface ClineTranslatorState {
  readonly builtinToolNames: ReadonlySet<string>;
  readonly dynamicToolCallIds: Set<string>;
  readonly hostToolNames: ReadonlySet<string>;
  readonly ignoredToolNames: ReadonlySet<string>;
  readonly mcpToolNames: ReadonlySet<string>;
  openTextBlockId?: string;
  openReasoningBlockId?: string;
  emittedToolCalls: Set<string>;
  pendingFinishStep?: FinishStepPart;
  blockCounter: number;
}

export function createClineTranslatorState({
  builtinToolNames,
  hostToolNames = [],
  ignoredToolNames = [],
  mcpToolNames = [],
}: {
  builtinToolNames: Iterable<string>;
  hostToolNames?: Iterable<string>;
  ignoredToolNames?: Iterable<string>;
  mcpToolNames?: Iterable<string>;
}): ClineTranslatorState {
  return {
    builtinToolNames: new Set(builtinToolNames),
    dynamicToolCallIds: new Set(),
    hostToolNames: new Set(hostToolNames),
    ignoredToolNames: new Set(ignoredToolNames),
    mcpToolNames: new Set(mcpToolNames),
    emittedToolCalls: new Set(),
    blockCounter: 0,
  };
}

function closeOpenBlocks(state: ClineTranslatorState): HarnessV1StreamPart[] {
  const parts: HarnessV1StreamPart[] = [];
  if (state.openReasoningBlockId) {
    parts.push({ type: 'reasoning-end', id: state.openReasoningBlockId });
    state.openReasoningBlockId = undefined;
  }
  if (state.openTextBlockId) {
    parts.push({ type: 'text-end', id: state.openTextBlockId });
    state.openTextBlockId = undefined;
  }
  return parts;
}

function toolCallPart(
  state: ClineTranslatorState,
  toolCall: { toolCallId: string; toolName: string; input: unknown },
): HarnessV1StreamPart {
  const isMcpTool =
    state.mcpToolNames.has(toolCall.toolName) &&
    !state.hostToolNames.has(toolCall.toolName);
  if (isMcpTool) {
    state.dynamicToolCallIds.add(toolCall.toolCallId);
  }
  if (toolCall.toolName === 'ask_question') {
    const nativeInput = toolCall.input as {
      question: string;
      options: string[];
    };
    return {
      type: 'tool-call',
      toolCallId: toolCall.toolCallId,
      toolName: 'askUserQuestions',
      input: JSON.stringify({
        allowPartialAnswers: false,
        questions: [
          {
            id: 'question-1',
            question: nativeInput.question,
            options: nativeInput.options.map((label, index) => ({
              id: `option-${index + 1}`,
              label,
            })),
            allowFreeForm: true,
          },
        ],
      }),
      providerExecuted: false,
      providerMetadata: {
        cline: {
          nativeRequest: nativeInput,
        },
      },
      nativeName: 'ask_question',
    };
  }
  return {
    type: 'tool-call',
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: JSON.stringify(toolCall.input ?? {}),
    /*
     * Built-ins and external MCP tools are executed by the Cline runtime.
     * Typed host tools wait for dispatch through `submitToolResult`, including
     * when a host tool has the same name as a configured MCP tool.
     */
    ...(state.builtinToolNames.has(toolCall.toolName) || isMcpTool
      ? { providerExecuted: true }
      : {}),
    ...(isMcpTool ? { dynamic: true } : {}),
  };
}

/**
 * Emit the `tool-call` + `tool-approval-request` pair for a built-in tool
 * that requires approval. The Cline runtime asks for approval *before* its
 * `tool-started` event fires, so the `tool-call` part is emitted here and
 * deduplicated when `tool-started` arrives.
 */
export function toolApprovalParts(
  state: ClineTranslatorState,
  toolCall: { toolCallId: string; toolName: string; input: unknown },
): HarnessV1StreamPart[] {
  const parts: HarnessV1StreamPart[] = [];
  if (!state.emittedToolCalls.has(toolCall.toolCallId)) {
    state.emittedToolCalls.add(toolCall.toolCallId);
    parts.push(toolCallPart(state, toolCall));
  }
  parts.push({
    type: 'tool-approval-request',
    approvalId: toolCall.toolCallId,
    toolCallId: toolCall.toolCallId,
  });
  return parts;
}

/**
 * Translate one Cline runtime event into zero or more harness stream parts.
 * Terminal events (`run-finished`, `run-failed`) are intentionally not
 * translated here — the session driver emits `finish`/`error` after the
 * runtime's promise settles, so a suspend can close the stream cleanly.
 */
export function translateClineEvent(
  event: AgentRuntimeEvent,
  state: ClineTranslatorState,
): HarnessV1StreamPart[] {
  switch (event.type) {
    case 'assistant-reasoning-delta': {
      const parts: HarnessV1StreamPart[] = [];
      if (state.openTextBlockId) {
        parts.push({ type: 'text-end', id: state.openTextBlockId });
        state.openTextBlockId = undefined;
      }
      if (!state.openReasoningBlockId) {
        state.openReasoningBlockId = `reasoning-${++state.blockCounter}`;
        parts.push({ type: 'reasoning-start', id: state.openReasoningBlockId });
      }
      parts.push({
        type: 'reasoning-delta',
        id: state.openReasoningBlockId,
        delta: event.text,
      });
      return parts;
    }

    case 'assistant-text-delta': {
      const parts: HarnessV1StreamPart[] = [];
      if (state.openReasoningBlockId) {
        parts.push({ type: 'reasoning-end', id: state.openReasoningBlockId });
        state.openReasoningBlockId = undefined;
      }
      if (!state.openTextBlockId) {
        state.openTextBlockId = `text-${++state.blockCounter}`;
        parts.push({ type: 'text-start', id: state.openTextBlockId });
      }
      parts.push({
        type: 'text-delta',
        id: state.openTextBlockId,
        delta: event.text,
      });
      return parts;
    }

    case 'assistant-message': {
      const parts = closeOpenBlocks(state);
      state.pendingFinishStep = {
        type: 'finish-step',
        finishReason: mapModelFinishReason(event.finishReason),
        usage: usageFromMessageMetrics(event.message.metrics),
      };
      return parts;
    }

    case 'turn-finished': {
      const pendingFinishStep = state.pendingFinishStep;
      if (!pendingFinishStep) {
        return [];
      }
      state.pendingFinishStep = undefined;
      return [pendingFinishStep];
    }

    case 'tool-started': {
      if (state.ignoredToolNames.has(event.toolCall.toolName)) return [];
      if (state.emittedToolCalls.has(event.toolCall.toolCallId)) {
        return [];
      }
      state.emittedToolCalls.add(event.toolCall.toolCallId);
      return [toolCallPart(state, event.toolCall)];
    }

    case 'tool-finished': {
      if (state.ignoredToolNames.has(event.toolCall.toolName)) return [];
      // The tool message carries the runtime's recorded result for this call.
      const resultPart = event.message.content.find(
        (part): part is Extract<typeof part, { type: 'tool-result' }> =>
          part.type === 'tool-result' &&
          part.toolCallId === event.toolCall.toolCallId,
      );
      const output = resultPart?.output as AgentToolResult['output'] | unknown;
      const dynamic = state.dynamicToolCallIds.delete(
        event.toolCall.toolCallId,
      );
      return [
        {
          type: 'tool-result',
          toolCallId: event.toolCall.toolCallId,
          toolName:
            event.toolCall.toolName === 'ask_question'
              ? 'askUserQuestions'
              : event.toolCall.toolName,
          result: toToolResultValue(output),
          ...(resultPart?.isError ? { isError: true } : {}),
          ...(dynamic ? { dynamic: true } : {}),
        },
      ];
    }

    case 'tool-updated':
      return [
        {
          type: 'raw',
          rawValue: {
            type: 'tool-updated',
            toolCallId: event.toolCall.toolCallId,
            toolName: event.toolCall.toolName,
            update: event.update,
          },
        },
      ];

    case 'status-notice':
      return [
        {
          type: 'raw',
          rawValue: {
            type: 'status-notice',
            message: event.message,
            ...(event.metadata ? { metadata: event.metadata } : {}),
          },
        },
      ];

    default:
      return [];
  }
}

/**
 * Close any blocks still open when the turn ends (e.g. an aborted turn whose
 * `assistant-message` never arrived). A buffered step that never reached
 * Cline's `turn-finished` boundary is incomplete and must not be emitted.
 */
export function finishClineTranslation(
  state: ClineTranslatorState,
): HarnessV1StreamPart[] {
  const parts = closeOpenBlocks(state);
  state.pendingFinishStep = undefined;
  return parts;
}
