import { randomUUID } from 'node:crypto';

type Emit = (message: Record<string, unknown>) => void;

export type ClaudeMessage = {
  type?: string;
  subtype?: string;
  model?: string;
  error?: string;
  error_status?: number | null;
  attempt?: number;
  max_retries?: number;
  retry_delay_ms?: number;
  patch?: { status?: string; error?: string };
  compact_metadata?: {
    trigger: 'manual' | 'auto';
    pre_tokens?: number;
    post_tokens?: number;
  };
  event?: {
    type?: string;
    index?: number;
    content_block?: { type?: string };
    delta?: { type?: string; text?: string; thinking?: string };
  };
  message?: {
    content?: ReadonlyArray<MessageBlock>;
    usage?: Record<string, unknown>;
  };
  result?: string;
  errors?: ReadonlyArray<string>;
  usage?: Record<string, unknown>;
  total_cost_usd?: number;
};

type MessageBlock = {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

export type ClaudeStreamEventState = {
  /*
   * Map of native tool-use id → tool name. Claude assistant messages emit
   * `tool_use` blocks with both `id` and `name`; the matching `tool_result`
   * block on a later user message carries only `tool_use_id`, so without this
   * map the tool-result event would have to emit `toolName: 'unknown'`.
   */
  nativeToolCallNames: Map<string, string>;
  approvalRequestedToolUseIds: Set<string>;
  partialBlocks: Map<number, { id: string; kind: 'text' | 'thinking' }>;
  stepUsage: Record<string, unknown> | undefined;
  pendingStepToolUseIds: Set<string>;
  pendingStepUsage: Record<string, unknown> | undefined;
  stepOpen: boolean;
  /*
   * Tool-use ids that originated from the MCP server hosting user-supplied
   * tools. The MCP handler emits its own `tool-call`/`tool-result` pair with
   * the user-facing tool name and a synthetic id, so the duplicate
   * `tool_result` block Claude reports for the underlying native id must be
   * suppressed.
   */
  mcpToolUseIds: Set<string>;
  observedTerminalError: string | undefined;
};

export function createClaudeStreamEventState(): ClaudeStreamEventState {
  return {
    nativeToolCallNames: new Map(),
    approvalRequestedToolUseIds: new Set(),
    partialBlocks: new Map(),
    stepUsage: undefined,
    pendingStepToolUseIds: new Set(),
    pendingStepUsage: undefined,
    stepOpen: false,
    mcpToolUseIds: new Set(),
    observedTerminalError: undefined,
  };
}

const UNRECOVERABLE_API_RETRY_STATUSES = new Set([401, 403, 404]);

export function createEmitStreamEvent({
  state,
  emit,
  emitWarning,
  emitTerminalError,
  onCompactionBoundary,
  toCommonName,
}: {
  state: ClaudeStreamEventState;
  emit: Emit;
  emitWarning: (warning: { message: string }) => void;
  emitTerminalError: (message: string | undefined) => void;
  onCompactionBoundary: (boundary: {
    trigger: 'manual' | 'auto';
    tokensBefore?: number;
    tokensAfter?: number;
  }) => void;
  toCommonName: (nativeName: string) => string;
}): (event: ClaudeMessage) => void {
  let streamStarted = false;

  return msg => {
    const type = msg.type;

    // Emit `stream-start` once, on the first message, carrying the model the
    // CLI resolved to (the `system`/`init` message reports it — this is the
    // default model when none was configured).
    if (!streamStarted) {
      const initModel =
        type === 'system' &&
        msg.subtype === 'init' &&
        typeof (msg as { model?: unknown }).model === 'string'
          ? (msg as { model: string }).model
          : undefined;
      emit({
        type: 'stream-start',
        ...(initModel ? { modelId: initModel } : {}),
      });
      streamStarted = true;
    }

    if (type === 'system' && msg.subtype === 'api_retry') {
      if (
        typeof msg.error_status === 'number' &&
        UNRECOVERABLE_API_RETRY_STATUSES.has(msg.error_status)
      ) {
        emitTerminalError(
          `HTTP ${msg.error_status}: ${msg.error ?? 'provider request failed'}`,
        );
        return;
      }

      emitWarning({ message: formatApiRetryWarning(msg) });
      return;
    }

    if (typeof msg.error === 'string' && msg.error.trim()) {
      state.observedTerminalError = msg.error.trim();
    }

    if (
      type === 'auth_status' &&
      typeof msg.error === 'string' &&
      msg.error.trim()
    ) {
      emitTerminalError(msg.error);
      return;
    }

    if (
      type === 'system' &&
      msg.subtype === 'task_updated' &&
      msg.patch?.status === 'failed' &&
      typeof msg.patch.error === 'string'
    ) {
      emitTerminalError(msg.patch.error);
      return;
    }

    if (type === 'system' && msg.subtype === 'compact_boundary') {
      const meta = msg.compact_metadata;
      if (meta) {
        onCompactionBoundary({
          trigger: meta.trigger,
          ...(typeof meta.pre_tokens === 'number'
            ? { tokensBefore: meta.pre_tokens }
            : {}),
          ...(typeof meta.post_tokens === 'number'
            ? { tokensAfter: meta.post_tokens }
            : {}),
        });
      }
      return;
    }

    if (type === 'stream_event') {
      handleStreamEvent(msg.event, state.partialBlocks, emit);
      return;
    }

    if (type === 'assistant' && msg.message?.content) {
      const usage = mapUsage(msg.message.usage);
      const toolUseIds: string[] = [];
      let opensStep = false;
      for (const block of msg.message.content) {
        if (
          block.type === 'tool_use' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
          toolUseIds.push(block.id);
          const mcpPrefix = 'mcp__harness-tools__';
          if (block.name.startsWith(mcpPrefix)) {
            state.pendingStepToolUseIds.add(block.id);
            state.mcpToolUseIds.add(block.id);
            opensStep = true;
            continue;
          }
          state.nativeToolCallNames.set(block.id, block.name);
          if (state.approvalRequestedToolUseIds.has(block.id)) {
            continue;
          }
          state.pendingStepToolUseIds.add(block.id);
          opensStep = true;
          emit({
            type: 'tool-call',
            toolCallId: block.id,
            toolName: toCommonName(block.name),
            nativeName: block.name,
            input: JSON.stringify(block.input ?? {}),
            providerExecuted: true,
          });
        }
      }
      if (opensStep || toolUseIds.length === 0) {
        state.stepOpen = true;
        if (usage) state.pendingStepUsage = usage;
      }
      return;
    }

    if (type === 'user' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (
          block.type === 'tool_result' &&
          typeof block.tool_use_id === 'string'
        ) {
          if (state.mcpToolUseIds.has(block.tool_use_id)) {
            state.mcpToolUseIds.delete(block.tool_use_id);
            state.pendingStepToolUseIds.delete(block.tool_use_id);
            continue;
          }
          state.approvalRequestedToolUseIds.delete(block.tool_use_id);
          const nativeName =
            state.nativeToolCallNames.get(block.tool_use_id) ?? 'unknown';
          state.nativeToolCallNames.delete(block.tool_use_id);
          const toolName = toCommonName(nativeName);
          const isError = !!block.is_error;
          const content = stringifyContent(block.content);
          /*
           * Claude Code's Bash tool does not report the command's real
           * numeric exit code — the SDK exposes only stdout/stderr text and
           * an is_error flag. Consumers (and the example UI) render bash
           * failures from an `exitCode` field on a structured result, the
           * shape Codex's shell tool provides natively. To match it, derive
           * a binary code from is_error: 1 on failure, 0 on success. This is
           * a stand-in for failed/succeeded, not the process's true exit
           * status.
           */
          const result =
            toolName === 'bash'
              ? { exitCode: isError ? 1 : 0, stdout: content }
              : content;
          emit({
            type: 'tool-result',
            toolCallId: block.tool_use_id,
            toolName,
            result,
            isError,
          });
          state.pendingStepToolUseIds.delete(block.tool_use_id);
        }
      }
      closeStepIfReady({ state, emit });
    }
  };
}

export function finishApprovalStep({
  state,
  emit,
  approvalId,
}: {
  state: ClaudeStreamEventState;
  emit: Emit;
  approvalId: string;
}): void {
  state.stepOpen = true;
  state.pendingStepToolUseIds.delete(approvalId);
  closeStepIfReady({ state, emit });
}

export function emitFinishStep({
  state,
  emit,
  usage,
}: {
  state: ClaudeStreamEventState;
  emit: Emit;
  usage: Record<string, unknown> | undefined;
}): void {
  emit({
    type: 'finish-step',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: usage ?? defaultUsage(),
  });
  state.stepUsage = usage ?? state.stepUsage;
  state.pendingStepUsage = undefined;
  state.pendingStepToolUseIds = new Set();
  state.stepOpen = false;
}

function closeStepIfReady({
  state,
  emit,
}: {
  state: ClaudeStreamEventState;
  emit: Emit;
}): void {
  if (
    !state.stepOpen ||
    state.pendingStepToolUseIds.size > 0 ||
    state.partialBlocks.size > 0
  ) {
    return;
  }
  emitFinishStep({ state, emit, usage: state.pendingStepUsage });
}

function formatApiRetryWarning(msg: ClaudeMessage): string {
  const details: string[] = [];
  if (typeof msg.attempt === 'number') {
    const maxRetries =
      typeof msg.max_retries === 'number' ? `/${msg.max_retries}` : '';
    details.push(`attempt ${msg.attempt}${maxRetries}`);
  }
  if (typeof msg.error_status === 'number') {
    details.push(`HTTP ${msg.error_status}`);
  }
  if (typeof msg.retry_delay_ms === 'number') {
    details.push(`retrying in ${msg.retry_delay_ms}ms`);
  }
  if (msg.error) details.push(msg.error);
  return details.length > 0
    ? `Claude Code API retry: ${details.join('; ')}`
    : 'Claude Code API retry';
}

function handleStreamEvent(
  event: ClaudeMessage['event'] | undefined,
  partialBlocks: Map<number, { id: string; kind: 'text' | 'thinking' }>,
  send: Emit,
): void {
  if (!event || typeof event.index !== 'number') return;
  const index = event.index;

  if (event.type === 'content_block_start') {
    const blockType = event.content_block?.type;
    if (blockType === 'text') {
      const id = randomUUID();
      partialBlocks.set(index, { id, kind: 'text' });
      send({ type: 'text-start', id });
    } else if (blockType === 'thinking') {
      const id = randomUUID();
      partialBlocks.set(index, { id, kind: 'thinking' });
      send({ type: 'reasoning-start', id });
    }
    return;
  }

  if (event.type === 'content_block_delta') {
    const block = partialBlocks.get(index);
    if (!block) return;
    if (
      block.kind === 'text' &&
      event.delta?.type === 'text_delta' &&
      typeof event.delta.text === 'string'
    ) {
      send({ type: 'text-delta', id: block.id, delta: event.delta.text });
    } else if (
      block.kind === 'thinking' &&
      event.delta?.type === 'thinking_delta' &&
      typeof event.delta.thinking === 'string'
    ) {
      send({
        type: 'reasoning-delta',
        id: block.id,
        delta: event.delta.thinking,
      });
    }
    return;
  }

  if (event.type === 'content_block_stop') {
    const block = partialBlocks.get(index);
    if (!block) return;
    partialBlocks.delete(index);
    if (block.kind === 'text') {
      send({ type: 'text-end', id: block.id });
    } else {
      send({ type: 'reasoning-end', id: block.id });
    }
  }
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(entry =>
        entry && typeof entry === 'object' && 'text' in entry
          ? String((entry as { text?: unknown }).text ?? '')
          : JSON.stringify(entry),
      )
      .join('');
  }
  return JSON.stringify(content);
}

export function mapUsage(usage: unknown): Record<string, unknown> | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  return {
    inputTokens: {
      total:
        (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0),
      noCache: u.input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
    outputTokens: {
      total: u.output_tokens ?? 0,
      text: u.output_tokens ?? 0,
    },
  };
}

export function defaultUsage(): Record<string, unknown> {
  return {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0 },
  };
}
