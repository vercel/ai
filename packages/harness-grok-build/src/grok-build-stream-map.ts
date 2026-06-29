import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import {
  GROK_BUILD_BUILTIN_NATIVE_NAMES,
  toCommonName,
} from './grok-build-harness';

// V4 types via the finish part shape (@ai-sdk/provider isn't a dependency).
type FinishPart = Extract<HarnessV1StreamPart, { type: 'finish' }>;
type LanguageModelV4FinishReason = FinishPart['finishReason'];
type LanguageModelV4Usage = FinishPart['totalUsage'];

export type AcpStreamState = {
  streamStarted: boolean;
  openTextId: string | null;
  openReasoningId: string | null;
  nextId: number;
  // Host-tool names whose ACP tool_call/tool_call_update events are suppressed:
  // the HTTP relay owns the tool-call/tool-result lifecycle for these.
  hostToolNames: ReadonlySet<string>;
  // Grok native names that map to a HarnessV1 builtin; only these (and host
  // tools) may surface as tool-call parts.
  builtinNativeNames: ReadonlySet<string>;
  // ACP toolCallIds the stream map has classified as host tools (to also drop
  // their later tool_call_update without re-deriving the name).
  suppressedToolCallIds: Set<string>;
  // ACP toolCallIds for grok-internal tools (e.g. search_tool/use_tool) whose
  // updates are emitted as raw rather than tool-result.
  rawToolCallIds: Set<string>;
  // Common tool name per ACP toolCallId, so tool_call_update results can be
  // paired with the originating tool-call's name.
  toolNamesById: Map<string, string>;
};

export function createAcpStreamState(
  hostToolNames: ReadonlySet<string> = new Set(),
  builtinNativeNames: ReadonlySet<string> = GROK_BUILD_BUILTIN_NATIVE_NAMES,
): AcpStreamState {
  return {
    streamStarted: false,
    openTextId: null,
    openReasoningId: null,
    nextId: 0,
    hostToolNames,
    builtinNativeNames,
    suppressedToolCallIds: new Set(),
    rawToolCallIds: new Set(),
    toolNamesById: new Map(),
  };
}

// Grok prefixes MCP tool titles with the server name (e.g. `harness-tools__foo`
// or `harness-tools:foo`). Strip a leading `harness-tools` segment so the bare
// host-tool name can be matched against the registered set.
function stripHostServerPrefix(title: string): string {
  const match = title.match(/^harness-tools[:_]+(.+)$/);
  return match ? match[1] : title;
}

function mintId(state: AcpStreamState, prefix: string): string {
  return `${prefix}_${state.nextId++}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

// ACP content `{type:'text', text}` → the text string, else ''.
function textFromContent(content: unknown): string {
  const rec = asRecord(content);
  if (rec === null) return '';
  return typeof rec['text'] === 'string' ? rec['text'] : '';
}

// Find a `{type:'diff', diff:{path}}` entry in tool_call content; returns its path.
function diffPathFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const entry of content) {
    const rec = asRecord(entry);
    if (rec?.['type'] === 'diff') {
      const diff = asRecord(rec['diff']);
      if (diff !== null && typeof diff['path'] === 'string') {
        return diff['path'];
      }
    }
  }
  return null;
}

function emptyUsage(): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  };
}

function usageFromMeta(meta: unknown): LanguageModelV4Usage {
  const rec = asRecord(meta);
  if (rec === null) return emptyUsage();
  const num = (key: string): number | undefined =>
    typeof rec[key] === 'number' ? (rec[key] as number) : undefined;
  return {
    inputTokens: {
      total: num('inputTokens'),
      noCache: undefined,
      cacheRead: num('cachedReadTokens'),
      cacheWrite: undefined,
    },
    outputTokens: {
      total: num('outputTokens'),
      text: undefined,
      reasoning: num('reasoningTokens'),
    },
    raw: { totalTokens: num('totalTokens') ?? null },
  };
}

function mapStopReason(raw: string | undefined): LanguageModelV4FinishReason {
  switch (raw) {
    case 'end_turn':
      return { unified: 'stop', raw };
    case 'max_tokens':
    case 'max_turn_requests':
      return { unified: 'length', raw };
    case 'refusal':
      return { unified: 'content-filter', raw };
    case 'cancelled':
      return { unified: 'stop', raw };
    default:
      return { unified: 'other', raw };
  }
}

// Map one ACP `session/update` notification's `update` to stream parts. Pure, never throws.
export function mapAcpUpdate(
  update: unknown,
  state: AcpStreamState,
): HarnessV1StreamPart[] {
  const rec = asRecord(update);
  if (rec === null) return [];

  const sessionUpdate = rec['sessionUpdate'];
  if (typeof sessionUpdate !== 'string') return [];

  const parts: HarnessV1StreamPart[] = [];

  function ensureStreamStart() {
    if (!state.streamStarted) {
      state.streamStarted = true;
      parts.push({ type: 'stream-start' });
    }
  }

  function closeTextBlock() {
    if (state.openTextId !== null) {
      parts.push({ type: 'text-end', id: state.openTextId });
      state.openTextId = null;
    }
  }

  function closeReasoningBlock() {
    if (state.openReasoningId !== null) {
      parts.push({ type: 'reasoning-end', id: state.openReasoningId });
      state.openReasoningId = null;
    }
  }

  ensureStreamStart();

  switch (sessionUpdate) {
    case 'agent_thought_chunk': {
      const delta = textFromContent(rec['content']);
      closeTextBlock();
      if (state.openReasoningId === null) {
        const id = mintId(state, 'reasoning');
        state.openReasoningId = id;
        parts.push({ type: 'reasoning-start', id });
      }
      parts.push({
        type: 'reasoning-delta',
        id: state.openReasoningId,
        delta,
      });
      break;
    }

    case 'agent_message_chunk': {
      const delta = textFromContent(rec['content']);
      closeReasoningBlock();
      if (state.openTextId === null) {
        const id = mintId(state, 'text');
        state.openTextId = id;
        parts.push({ type: 'text-start', id });
      }
      parts.push({ type: 'text-delta', id: state.openTextId, delta });
      break;
    }

    case 'tool_call': {
      const toolCallId =
        typeof rec['toolCallId'] === 'string' ? rec['toolCallId'] : '';
      const title = typeof rec['title'] === 'string' ? rec['title'] : '';
      const kind = typeof rec['kind'] === 'string' ? rec['kind'] : undefined;
      // Host tools are mediated by the relay, which emits their tool-call /
      // tool-result. Suppress grok's own ACP events to avoid duplicates.
      if (state.hostToolNames.has(stripHostServerPrefix(title))) {
        state.suppressedToolCallIds.add(toolCallId);
        return [];
      }
      // Grok-internal tools (search_tool/use_tool/etc.) have no builtin mapping;
      // emitting them as tool-call would trip AI_NoSuchToolError. Surface raw.
      if (!state.builtinNativeNames.has(title)) {
        state.rawToolCallIds.add(toolCallId);
        return [{ type: 'raw', rawValue: update }];
      }
      const commonName = toCommonName(title);
      state.toolNamesById.set(toolCallId, commonName);
      parts.push({
        type: 'tool-call',
        toolCallId,
        toolName: commonName,
        nativeName: title,
        input: JSON.stringify(rec['rawInput'] ?? {}),
        providerExecuted: true,
      });
      const diffPath = diffPathFromContent(rec['content']);
      if (diffPath !== null) {
        parts.push({ type: 'file-change', event: 'modify', path: diffPath });
      } else if (kind === 'edit') {
        const single = asRecord(
          Array.isArray(rec['content']) ? rec['content'][0] : rec['content'],
        );
        const diff = asRecord(single?.['diff']);
        if (diff !== null && typeof diff['path'] === 'string') {
          parts.push({
            type: 'file-change',
            event: 'modify',
            path: diff['path'],
          });
        }
      }
      break;
    }

    case 'tool_call_update': {
      const updateToolCallId =
        typeof rec['toolCallId'] === 'string' ? rec['toolCallId'] : '';
      if (state.rawToolCallIds.has(updateToolCallId)) {
        return [{ type: 'raw', rawValue: update }];
      }
      const status = typeof rec['status'] === 'string' ? rec['status'] : '';
      if (status !== 'completed' && status !== 'failed') return [];
      const toolCallId = updateToolCallId;
      if (state.suppressedToolCallIds.has(toolCallId)) return [];
      const output = rec['rawOutput'] ?? rec['content'] ?? null;
      parts.push({
        type: 'tool-result',
        toolCallId,
        toolName: state.toolNamesById.get(toolCallId) ?? '',
        result: output as never,
        isError: status === 'failed',
      });
      break;
    }

    case 'user_message_chunk':
    case 'available_commands_update':
    case 'current_mode_update':
    case 'plan': {
      parts.push({ type: 'raw', rawValue: update });
      break;
    }

    default: {
      parts.push({ type: 'raw', rawValue: update });
      break;
    }
  }

  return parts;
}

// Build the turn-final `finish` part from a `session/prompt` result. Closes open blocks if state given.
export function finishFromResult(
  result: { stopReason?: string; _meta?: unknown },
  state?: AcpStreamState,
): HarnessV1StreamPart[] {
  const parts: HarnessV1StreamPart[] = [];
  if (state) {
    if (state.openReasoningId !== null) {
      parts.push({ type: 'reasoning-end', id: state.openReasoningId });
      state.openReasoningId = null;
    }
    if (state.openTextId !== null) {
      parts.push({ type: 'text-end', id: state.openTextId });
      state.openTextId = null;
    }
  }
  const finishReason = mapStopReason(result?.stopReason);
  const usage =
    result?._meta === undefined ? emptyUsage() : usageFromMeta(result._meta);
  // finish-step carries the finishReason + usage the agent uses for the result;
  // finish only drives end-of-turn telemetry.
  parts.push({ type: 'finish-step', finishReason, usage });
  parts.push({ type: 'finish', finishReason, totalUsage: usage });
  return parts;
}
