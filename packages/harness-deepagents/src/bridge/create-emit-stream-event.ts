import { randomUUID } from 'node:crypto';

type Emit = (event: Record<string, unknown>) => void;

export type DeepAgentsStreamEvent = {
  event?: string;
  name?: string;
  run_id?: string;
  data?: unknown;
  metadata?: {
    langgraph_checkpoint_ns?: string;
    ls_model_name?: unknown;
  };
};

export type DeepAgentsStreamEventState = {
  streamStarted: boolean;
  textBlockId: string | undefined;
  reasoningBlockId: string | undefined;
  inputTokens: number;
  outputTokens: number;
  // Per-call streamed-usage fallback (max over chunks), used only when model-end carries no usage.
  streamedStepInput: number;
  streamedStepOutput: number;
  // Top-level step usage is buffered at model-end and flushed as finish-step only after the step's tools run.
  pendingStep: { input: number; output: number } | undefined;
  // Approval-gated tools are announced before execution; these tie the later run back to the approval id and dedup the call.
  approvedToolQueue: Map<string, string[]>;
  approvedRunIds: Map<string, string>;
  dynamicToolRunIds: Set<string>;
  /*
   * Tool calls of the buffered step that have not settled yet, counted from
   * the tool calls reported at model-end. `undefined` when model-end did not
   * report them. Together with the host tool calls waiting on the host, this
   * tells whether the agent can only make progress after host input. In that
   * case an early `finish-step` lets the host pause the turn, while the step
   * stays buffered until the regular `finish-step`. Counting from model-end
   * keeps this independent of when LangGraph's tool events are delivered.
   */
  unsettledStepToolCallCount: number | undefined;
  /*
   * Host input requests that belong to the buffered step: host tool runs
   * whose `on_tool_start` was observed, and approval requests. A host tool
   * can start waiting before its step's events are delivered; it only counts
   * once its run is known to belong to the buffered step.
   */
  observedStepHostInputCount: number;
  hostInputWaitingToolCallIds: Set<string>;
  earlyFinishStepToolCallIds: Set<string>;
};

export function createDeepAgentsStreamEventState(): DeepAgentsStreamEventState {
  return {
    streamStarted: false,
    textBlockId: undefined,
    reasoningBlockId: undefined,
    inputTokens: 0,
    outputTokens: 0,
    streamedStepInput: 0,
    streamedStepOutput: 0,
    pendingStep: undefined,
    approvedToolQueue: new Map(),
    approvedRunIds: new Map(),
    dynamicToolRunIds: new Set(),
    unsettledStepToolCallCount: undefined,
    observedStepHostInputCount: 0,
    hostInputWaitingToolCallIds: new Set(),
    earlyFinishStepToolCallIds: new Set(),
  };
}

// Native Deep Agents tool name -> harness-v1 common name (renames only; grep/glob/ls/task/write_todos forward unchanged).
const NATIVE_TO_COMMON: Readonly<Record<string, string>> = {
  read_file: 'read',
  write_file: 'write',
  edit_file: 'edit',
  execute: 'bash',
};

export function toCommonName(nativeName: string): string {
  return NATIVE_TO_COMMON[nativeName] ?? nativeName;
}

export function createEmitStreamEvent({
  state,
  configuredModel,
  hostToolNames,
  mcpToolNames,
  structuredOutputToolNames = new Set(),
  emit,
}: {
  state: DeepAgentsStreamEventState;
  configuredModel: string | undefined;
  hostToolNames: ReadonlySet<string>;
  mcpToolNames: ReadonlySet<string>;
  structuredOutputToolNames?: ReadonlySet<string>;
  emit: Emit;
}): (event: DeepAgentsStreamEvent) => void {
  return event => {
    const kind = event.event;
    const data = (event.data ?? {}) as Record<string, unknown>;
    // Subagent (e.g. `task`) events carry a `|`-delimited checkpoint namespace; keep their internals out of the top-level stream.
    const ns = event.metadata?.langgraph_checkpoint_ns ?? '';
    const nested = ns.includes('|');

    if (kind === 'on_chat_model_start') {
      if (!nested) {
        if (!state.streamStarted) {
          state.streamStarted = true;
          const modelId = resolveDeepAgentsModelId({
            configuredModel,
            metadata: event.metadata,
          });
          emit({
            type: 'stream-start',
            ...(modelId ? { modelId } : {}),
          });
        }
        // A new top-level model call means the previous step's tools have run; close it now.
        flushStep({ state, emit });
      }
    } else if (kind === 'on_chat_model_stream') {
      if (nested) return;
      const chunk = data.chunk as
        | {
            content?: unknown;
            usage_metadata?: {
              input_tokens?: number;
              output_tokens?: number;
            };
          }
        | undefined;
      if (!chunk) return;
      const content = chunk.content;
      if (typeof content === 'string' && content) {
        emitText({ state, emit, delta: content });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object') {
            const value = block as {
              type?: string;
              text?: string;
              thinking?: string;
              reasoning?: string;
            };
            if (
              (value.type === 'text' || value.type === 'text-delta') &&
              value.text
            ) {
              emitText({ state, emit, delta: value.text });
            } else if (value.type === 'thinking' && value.thinking) {
              emitReasoning({ state, emit, delta: value.thinking });
            } else if (
              (value.type === 'reasoning' ||
                value.type === 'reasoning-delta') &&
              value.reasoning
            ) {
              emitReasoning({ state, emit, delta: value.reasoning });
            }
          }
        }
      }
      const usage = chunk.usage_metadata;
      if (usage) {
        state.streamedStepInput = Math.max(
          state.streamedStepInput,
          usage.input_tokens ?? 0,
        );
        state.streamedStepOutput = Math.max(
          state.streamedStepOutput,
          usage.output_tokens ?? 0,
        );
      }
    } else if (kind === 'on_chat_model_end') {
      // Final usage lands on model-end, not the chunks; each model call is one step.
      const output = data.output as
        | {
            usage_metadata?: {
              input_tokens?: number;
              output_tokens?: number;
            };
            tool_calls?: unknown;
          }
        | undefined;
      const usage = output?.usage_metadata;
      // One model call = one step; count its usage exactly once (model-end usage, else the streamed max).
      const stepInput = usage?.input_tokens ?? state.streamedStepInput;
      const stepOutput = usage?.output_tokens ?? state.streamedStepOutput;
      state.inputTokens += stepInput;
      state.outputTokens += stepOutput;
      state.streamedStepInput = 0;
      state.streamedStepOutput = 0;
      // Nested (subagent) calls still count toward total usage, but only top-level calls bound a visible step.
      if (!nested) {
        endTextBlock({ state, emit });
        endReasoningBlock({ state, emit });
        // Buffer the step; flushStep emits finish-step after this step's tools run (next start / turn end).
        state.pendingStep = { input: stepInput, output: stepOutput };
        state.unsettledStepToolCallCount = Array.isArray(output?.tool_calls)
          ? output.tool_calls.filter(
              toolCall =>
                !structuredOutputToolNames.has(
                  (toolCall as { name?: unknown } | null)?.name as string,
                ),
            ).length
          : undefined;
        emitEarlyFinishStepIfReady({ state, emit });
      }
    } else if (kind === 'on_tool_start') {
      const toolName = event.name ?? 'unknown';
      if (structuredOutputToolNames.has(toolName)) return;
      const runId = event.run_id ?? '';
      if (!nested && hostToolNames.has(toolName) && state.pendingStep) {
        state.observedStepHostInputCount += 1;
        emitEarlyFinishStepIfReady({ state, emit });
      }
      // Host tools emit their own tool-call; surface only top-level builtin (providerExecuted) tools.
      if (!nested && !hostToolNames.has(toolName)) {
        const isMcpTool = mcpToolNames.has(toolName);
        if (isMcpTool && runId) state.dynamicToolRunIds.add(runId);
        const queued = state.approvedToolQueue.get(toolName);
        if (queued && queued.length > 0) {
          // Already announced at approval time; tie this run to that id and don't re-emit the call.
          const approvalId = queued.shift()!;
          if (runId) state.approvedRunIds.set(runId, approvalId);
        } else {
          endTextBlock({ state, emit });
          endReasoningBlock({ state, emit });
          emit({
            type: 'tool-call',
            toolCallId: runId,
            toolName: toCommonName(toolName),
            input: toToolCallInput(data.input),
            providerExecuted: true,
            nativeName: toolName,
            ...(isMcpTool ? { dynamic: true } : {}),
          });
        }
      }
    } else if (kind === 'on_tool_end') {
      const toolName = event.name ?? 'unknown';
      if (structuredOutputToolNames.has(toolName)) return;
      const runId = event.run_id ?? '';
      if (!nested && !hostToolNames.has(toolName)) {
        const dynamic = state.dynamicToolRunIds.delete(runId);
        let output: unknown = data.output ?? '';
        if (output && typeof output === 'object' && 'content' in output) {
          output = (output as { content: unknown }).content;
        }
        emit({
          type: 'tool-result',
          toolCallId: state.approvedRunIds.get(runId) ?? runId,
          toolName: toCommonName(toolName),
          result: output ?? null,
          ...(dynamic ? { dynamic: true } : {}),
        });
        state.approvedRunIds.delete(runId);
        settleStepToolCall({ state, emit });
      }
    }
  };
}

export function endTextBlock({
  state,
  emit,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
}): void {
  if (state.textBlockId) {
    emit({ type: 'text-end', id: state.textBlockId });
    state.textBlockId = undefined;
  }
}

export function endReasoningBlock({
  state,
  emit,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
}): void {
  if (state.reasoningBlockId) {
    emit({ type: 'reasoning-end', id: state.reasoningBlockId });
    state.reasoningBlockId = undefined;
  }
}

// Close the buffered top-level step; called when the next step starts and at turn end so finish-step lands after the step's tools.
export function flushStep({
  state,
  emit,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
}): void {
  if (!state.pendingStep) return;
  emit({
    type: 'finish-step',
    finishReason: { unified: 'stop' },
    usage: {
      inputTokens: { total: state.pendingStep.input },
      outputTokens: { total: state.pendingStep.output },
    },
  });
  state.pendingStep = undefined;
  state.unsettledStepToolCallCount = undefined;
  state.observedStepHostInputCount = 0;
  state.earlyFinishStepToolCallIds = new Set();
}

export function markHostToolWaiting({
  state,
  emit,
  toolCallId,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
  toolCallId: string;
}): void {
  state.hostInputWaitingToolCallIds.add(toolCallId);
  emitEarlyFinishStepIfReady({ state, emit });
}

export function markApprovalsWaiting({
  state,
  emit,
  approvalIds,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
  approvalIds: ReadonlyArray<string>;
}): void {
  state.pendingStep ??= { input: 0, output: 0 };
  state.observedStepHostInputCount += approvalIds.length;
  for (const approvalId of approvalIds) {
    state.hostInputWaitingToolCallIds.add(approvalId);
  }
  emitEarlyFinishStepIfReady({ state, emit });
}

export function clearHostInputWaiting({
  state,
  toolCallId,
}: {
  state: DeepAgentsStreamEventState;
  toolCallId: string;
}): void {
  state.hostInputWaitingToolCallIds.delete(toolCallId);
}

export function settleHostToolCall({
  state,
  emit,
  toolCallId,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
  toolCallId: string;
}): void {
  state.hostInputWaitingToolCallIds.delete(toolCallId);
  settleStepToolCall({ state, emit });
}

function settleStepToolCall({
  state,
  emit,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
}): void {
  if (state.unsettledStepToolCallCount != null) {
    state.unsettledStepToolCallCount = Math.max(
      0,
      state.unsettledStepToolCallCount - 1,
    );
  }
  emitEarlyFinishStepIfReady({ state, emit });
}

function emitEarlyFinishStepIfReady({
  state,
  emit,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
}): void {
  const waiting = state.hostInputWaitingToolCallIds;
  if (
    !state.pendingStep ||
    waiting.size === 0 ||
    waiting.size > state.observedStepHostInputCount
  ) {
    return;
  }
  if (
    state.unsettledStepToolCallCount != null &&
    state.unsettledStepToolCallCount > waiting.size
  ) {
    return;
  }
  const uncovered = [...waiting].filter(
    toolCallId => !state.earlyFinishStepToolCallIds.has(toolCallId),
  );
  if (uncovered.length === 0) return;
  for (const toolCallId of uncovered) {
    state.earlyFinishStepToolCallIds.add(toolCallId);
  }
  emit({
    type: 'finish-step',
    finishReason: { unified: 'tool-calls', raw: 'host-input' },
    usage: {
      inputTokens: { total: 0 },
      outputTokens: { total: 0 },
    },
    harnessMetadata: { deepagents: { inferredStep: true } },
  });
}

function ensureTextBlock({
  state,
  emit,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
}): string {
  if (!state.textBlockId) {
    state.textBlockId = `text-${randomUUID()}`;
    emit({ type: 'text-start', id: state.textBlockId });
  }
  return state.textBlockId;
}

// Text and reasoning are mutually exclusive open blocks: starting one closes the other.
function emitText({
  state,
  emit,
  delta,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
  delta: string;
}): void {
  endReasoningBlock({ state, emit });
  emit({ type: 'text-delta', id: ensureTextBlock({ state, emit }), delta });
}

function emitReasoning({
  state,
  emit,
  delta,
}: {
  state: DeepAgentsStreamEventState;
  emit: Emit;
  delta: string;
}): void {
  endTextBlock({ state, emit });
  if (!state.reasoningBlockId) {
    state.reasoningBlockId = `reasoning-${randomUUID()}`;
    emit({ type: 'reasoning-start', id: state.reasoningBlockId });
  }
  emit({ type: 'reasoning-delta', id: state.reasoningBlockId, delta });
}

function resolveDeepAgentsModelId({
  configuredModel,
  metadata,
}: {
  configuredModel: string | undefined;
  metadata: unknown;
}): string | undefined {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const modelId = (metadata as { ls_model_name?: unknown }).ls_model_name;
    if (typeof modelId === 'string' && modelId.length > 0) return modelId;
  }

  return configuredModel;
}

// LangChain reports some built-in tool args wrapped as `{ input: "<json>" }`; unwrap to the inner JSON so AI SDK validates the real shape.
function toToolCallInput(raw: unknown): string {
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.keys(raw).length === 1 &&
    typeof (raw as { input?: unknown }).input === 'string'
  ) {
    const inner = (raw as { input: string }).input;
    if (/^\s*[[{]/.test(inner)) return inner;
  }
  return JSON.stringify(raw ?? {});
}
