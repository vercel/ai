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
  emit,
}: {
  state: DeepAgentsStreamEventState;
  configuredModel: string | undefined;
  hostToolNames: ReadonlySet<string>;
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
            };
            if (value.type === 'text' && value.text) {
              emitText({ state, emit, delta: value.text });
            } else if (value.type === 'thinking' && value.thinking) {
              emitReasoning({ state, emit, delta: value.thinking });
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
      }
    } else if (kind === 'on_tool_start') {
      const toolName = event.name ?? 'unknown';
      const runId = event.run_id ?? '';
      // Host tools emit their own tool-call; surface only top-level builtin (providerExecuted) tools.
      if (!nested && !hostToolNames.has(toolName)) {
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
          });
        }
      }
    } else if (kind === 'on_tool_end') {
      const toolName = event.name ?? 'unknown';
      const runId = event.run_id ?? '';
      if (!nested && !hostToolNames.has(toolName)) {
        let output: unknown = data.output ?? '';
        if (output && typeof output === 'object' && 'content' in output) {
          output = (output as { content: unknown }).content;
        }
        emit({
          type: 'tool-result',
          toolCallId: state.approvedRunIds.get(runId) ?? runId,
          toolName: toCommonName(toolName),
          result: output ?? null,
        });
        state.approvedRunIds.delete(runId);
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
