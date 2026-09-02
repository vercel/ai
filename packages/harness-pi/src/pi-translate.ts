import { randomBytes } from 'node:crypto';
import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import { extractAssistantText, type PiSessionEvent } from './pi-events';
import { serializeToolOutput } from './pi-utils';

/**
 * Translator state shared across all events of a single turn. Reset at the
 * start of every `doPromptTurn`. Callers update the same instance and read it to
 * decide when a turn has settled into a steady state (e.g. for gap-filling).
 */
export interface PiTranslatorState {
  /**
   * True once a `turn_start` or assistant `message_start` event has been
   * observed. Suppresses spurious deltas that arrive before the turn opens.
   */
  promptStarted: boolean;
  /** Accumulated assistant text from `text_delta` events. */
  streamedAssistantText: string;
  /** Stream-part id for the active text block; synthesized on first delta. */
  currentTextId: string | undefined;
  /**
   * Stream-part id for the active reasoning block; synthesized lazily on
   * first `thinking_delta`.
   */
  currentReasoningId: string | undefined;
  /** Whether a `reasoning-start` event has already been emitted. */
  reasoningStarted: boolean;
  /** Tool-call id → tool name (used to fill in `toolName` on results). */
  observedToolNames: Map<string, string>;
  /**
   * Content-block index → tool-call id for tool inputs that are still
   * streaming. Pi addresses `toolcall_*` events by `contentIndex`, while the
   * harness stream parts are keyed by the tool call id, so the id is resolved
   * once at `toolcall_start` and reused for the deltas that follow.
   */
  streamingToolInputIds: Map<number, string>;
  /** Tool ids requested by the current assistant message but not yet completed. */
  pendingStepToolCallIds: Set<string>;
  /** Total tool calls requested by the current assistant message. */
  stepToolCallCount: number | undefined;
  /** Whether the current assistant message has opened a visible step. */
  stepOpen: boolean;
  /**
   * Tool-call id → the exact output value the host submitted for a
   * user-registered (host-executed) tool. Pi only echoes the tool result back
   * as serialized text (the tool handler stringifies the output before handing
   * it to the runtime so the model can read it), which would otherwise reach
   * consumers as a string and lose the original object structure. Keeping the
   * submitted value here lets the result projection surface the original object
   * — matching the other adapters — while the model still receives the text.
   * Populated by the session's `submitToolResult`; consumed (and cleared) when
   * the matching `tool_result`/`tool_execution_end` event is translated.
   */
  hostToolResults: Map<string, unknown>;
  dynamicToolCallIds: Set<string>;
  /**
   * Names of tools that Pi executes natively (read/write/edit/bash/grep/
   * find/ls). `tool-call` events for these get `providerExecuted: true`
   * so the harness host doesn't try to dispatch them. User-registered
   * tools are not in this set.
   */
  readonly builtinToolNames: ReadonlySet<string>;
  readonly hostToolNames: ReadonlySet<string>;
  /**
   * Map of native tool name → common name. `find` → `glob`, etc. Pi emits
   * native names on its events; the wire `toolName` is the common name when
   * one exists.
   */
  readonly nativeToCommonNameMap: ReadonlyMap<string, string>;
}

export interface PiTranslatorStateOptions {
  readonly builtinToolNames?: ReadonlyArray<string>;
  readonly hostToolNames?: ReadonlyArray<string>;
  readonly nativeToCommon?:
    | ReadonlyMap<string, string>
    | Record<string, string>;
}

export function createPiTranslatorState(
  options: PiTranslatorStateOptions = {},
): PiTranslatorState {
  const map =
    options.nativeToCommon instanceof Map
      ? options.nativeToCommon
      : new Map(Object.entries(options.nativeToCommon ?? {}));
  return {
    promptStarted: false,
    streamedAssistantText: '',
    currentTextId: undefined,
    currentReasoningId: undefined,
    reasoningStarted: false,
    observedToolNames: new Map(),
    streamingToolInputIds: new Map(),
    pendingStepToolCallIds: new Set(),
    stepToolCallCount: undefined,
    stepOpen: false,
    hostToolResults: new Map(),
    dynamicToolCallIds: new Set(),
    builtinToolNames: new Set(options.builtinToolNames ?? []),
    hostToolNames: new Set(options.hostToolNames ?? []),
    nativeToCommonNameMap: map,
  };
}

function newId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Pi's `tool_execution_end` event payload (`result`) is a Pi `AgentToolResult`
 * envelope `{ content: (TextContent | ImageContent)[], details, terminate? }`.
 * The `tool_result` event uses a flat shape with `content` and `details` at
 * the top level. In both cases we extract just the text payload (joined when
 * multiple text parts are present) so the AI SDK consumer sees the raw
 * string the tool produced.
 */
function unwrapPiToolResult(event: PiSessionEvent): never {
  const candidates: unknown[] = [];
  const result = event.result as unknown;
  if (result && typeof result === 'object') {
    const inner = (result as { content?: unknown }).content;
    if (Array.isArray(inner)) candidates.push(inner);
  }
  if (Array.isArray(event.content)) candidates.push(event.content);

  for (const content of candidates) {
    if (!Array.isArray(content)) continue;
    const text = content
      .filter(
        (p): p is { type: 'text'; text: string } =>
          !!p &&
          typeof p === 'object' &&
          (p as { type?: unknown }).type === 'text' &&
          typeof (p as { text?: unknown }).text === 'string',
      )
      .map(p => p.text)
      .join('');
    if (text) return text as never;
  }

  if (typeof event.result === 'string') return event.result as never;
  if (typeof event.content === 'string') return event.content as never;
  return (event.result ?? event.content ?? null) as never;
}

function parseMcpToolResult(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  try {
    return secureJsonParse(content);
  } catch {
    return content;
  }
}

function resolveToolName(
  state: PiTranslatorState,
  nativeName: string,
): { wire: string; native: string } {
  const common = state.nativeToCommonNameMap.get(nativeName);
  return { wire: common ?? nativeName, native: nativeName };
}

/**
 * How a tool call is dispatched, from the native tool name. Pi runs its
 * builtin tools and MCP tools itself; everything else is handed back to the
 * harness host. `tool-input-start` reports the same flags as the `tool-call`
 * that follows it so a consumer does not have to wait for the call to know
 * who will execute it.
 */
function resolveToolDispatch(
  state: PiTranslatorState,
  nativeName: string,
): { isMcpTool: boolean; providerExecuted: boolean } {
  const isMcpTool =
    !state.hostToolNames.has(nativeName) &&
    (nativeName === 'mcp' || nativeName.startsWith('mcp__'));
  return {
    isMcpTool,
    providerExecuted: state.builtinToolNames.has(nativeName) || isMcpTool,
  };
}

/**
 * The `{ id, name }` of the tool call a `toolcall_*` event refers to, read out
 * of the partial assistant message it carries. Returns undefined when the
 * block is missing or not a tool call yet, in which case the input is left
 * unstreamed — the complete `tool-call` still arrives at `tool_execution_start`.
 */
function readStreamingToolCall(
  event: PiSessionEvent,
): { contentIndex: number; id: string; name: string } | undefined {
  const update = event.assistantMessageEvent;
  const contentIndex = update?.contentIndex;
  if (typeof contentIndex !== 'number') return undefined;
  const block = update?.partial?.content?.[contentIndex];
  if (!block || typeof block !== 'object') return undefined;
  const record = block as Record<string, unknown>;
  if (record.type !== 'toolCall') return undefined;
  const { id, name } = record;
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof name !== 'string' || name.length === 0) return undefined;
  return { contentIndex, id, name };
}

function finishStep(state: PiTranslatorState): HarnessV1StreamPart[] {
  if (!state.stepOpen || state.pendingStepToolCallIds.size > 0) return [];
  state.stepOpen = false;
  state.pendingStepToolCallIds.clear();
  state.stepToolCallCount = undefined;
  return [
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      harnessMetadata: { pi: { inferredStep: true } },
    },
  ];
}

export function finishPiApprovalStep(
  state: PiTranslatorState,
  toolCallId: string,
): HarnessV1StreamPart[] {
  state.stepOpen = true;
  state.pendingStepToolCallIds.delete(toolCallId);
  return finishStep(state);
}

function extractPiToolCallIds(message: PiSessionEvent['message']): string[] {
  if (!message || message.role !== 'assistant') return [];
  if (!Array.isArray(message.content)) return [];
  return message.content.flatMap(part => {
    if (!part || typeof part !== 'object') return [];
    const block = part as Record<string, unknown>;
    if (block.type !== 'toolCall') return [];
    const id = block.id ?? block.toolCallId;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

/**
 * Translate a single Pi `session.subscribe` event into zero or more
 * `HarnessV1StreamPart`s, updating the translator state in place. Returns
 * an empty array for events that produce no output (e.g. events emitted
 * before `turn_start`).
 *
 * The translator does NOT emit `stream-start`/`finish` — those are
 * lifecycle signals owned by the session layer.
 */
export function translatePiEvent(
  event: PiSessionEvent,
  state: PiTranslatorState,
): HarnessV1StreamPart[] {
  switch (event.type) {
    case 'turn_start':
    case 'message_start': {
      if (
        event.type === 'message_start' &&
        event.message?.role !== 'assistant'
      ) {
        return [];
      }
      state.promptStarted = true;
      if (event.type === 'message_start') {
        state.stepOpen = true;
        state.pendingStepToolCallIds.clear();
        state.stepToolCallCount = undefined;
      }
      state.streamedAssistantText = '';
      state.currentTextId = undefined;
      state.currentReasoningId = undefined;
      state.reasoningStarted = false;
      // Content-block indices restart with every assistant message.
      state.streamingToolInputIds.clear();
      return [];
    }

    case 'message_update': {
      if (!state.promptStarted) return [];
      const update = event.assistantMessageEvent;
      if (!update) return [];
      if (update.type === 'text_delta' && typeof update.delta === 'string') {
        const parts: HarnessV1StreamPart[] = [];
        // If reasoning was active, close it before opening the text block so
        // consumers can reset block-scoped formatting (ANSI colors, etc.)
        // between sections.
        if (state.reasoningStarted && state.currentReasoningId) {
          parts.push({
            type: 'reasoning-end',
            id: state.currentReasoningId,
          });
          state.reasoningStarted = false;
          state.currentReasoningId = undefined;
        }
        if (!state.currentTextId) {
          state.currentTextId = newId();
          parts.push({ type: 'text-start', id: state.currentTextId });
        }
        state.streamedAssistantText += update.delta;
        parts.push({
          type: 'text-delta',
          id: state.currentTextId,
          delta: update.delta,
        });
        return parts;
      }
      if (
        update.type === 'thinking_delta' &&
        typeof update.delta === 'string'
      ) {
        const parts: HarnessV1StreamPart[] = [];
        // Symmetric to the text branch: close any open text block before
        // starting a fresh reasoning block.
        if (state.currentTextId) {
          parts.push({ type: 'text-end', id: state.currentTextId });
          state.currentTextId = undefined;
        }
        if (!state.currentReasoningId) {
          state.currentReasoningId = newId();
        }
        if (!state.reasoningStarted) {
          state.reasoningStarted = true;
          parts.push({ type: 'reasoning-start', id: state.currentReasoningId });
        }
        parts.push({
          type: 'reasoning-delta',
          id: state.currentReasoningId,
          delta: update.delta,
        });
        return parts;
      }
      // Tool inputs stream as raw JSON text, the same way text and reasoning
      // stream. Surfacing them lets a consumer show what the model is writing
      // before the call is complete, instead of waiting for the whole input to
      // land at `tool_execution_start`.
      if (update.type === 'toolcall_start') {
        const call = readStreamingToolCall(event);
        if (!call) return [];
        const { wire, native } = resolveToolName(state, call.name);
        const { isMcpTool, providerExecuted } = resolveToolDispatch(
          state,
          native,
        );
        state.streamingToolInputIds.set(call.contentIndex, call.id);
        return [
          {
            type: 'tool-input-start',
            id: call.id,
            toolName: wire,
            ...(providerExecuted ? { providerExecuted: true } : {}),
            ...(isMcpTool ? { dynamic: true } : {}),
          },
        ];
      }
      if (update.type === 'toolcall_delta' || update.type === 'toolcall_end') {
        const contentIndex = update.contentIndex;
        if (typeof contentIndex !== 'number') return [];
        const id = state.streamingToolInputIds.get(contentIndex);
        // Without a start there is no id to attach the input to. Dropping it
        // is safe: the complete input still arrives with the `tool-call`.
        if (id === undefined) return [];
        if (update.type === 'toolcall_end') {
          state.streamingToolInputIds.delete(contentIndex);
          return [{ type: 'tool-input-end', id }];
        }
        if (typeof update.delta !== 'string') return [];
        return [{ type: 'tool-input-delta', id, delta: update.delta }];
      }
      return [];
    }

    case 'message_end':
    case 'turn_end': {
      if (!state.promptStarted) return [];
      const parts: HarnessV1StreamPart[] = [];
      const fullText = extractAssistantText(event.message);
      if (
        state.currentTextId &&
        fullText.startsWith(state.streamedAssistantText) &&
        fullText.length > state.streamedAssistantText.length
      ) {
        const missing = fullText.slice(state.streamedAssistantText.length);
        state.streamedAssistantText = fullText;
        parts.push({
          type: 'text-delta',
          id: state.currentTextId,
          delta: missing,
        });
      }
      if (state.currentTextId) {
        parts.push({ type: 'text-end', id: state.currentTextId });
        state.currentTextId = undefined;
      }
      if (state.reasoningStarted && state.currentReasoningId) {
        parts.push({ type: 'reasoning-end', id: state.currentReasoningId });
        state.reasoningStarted = false;
        state.currentReasoningId = undefined;
      }
      if (event.type === 'message_end') {
        const toolCallIds = extractPiToolCallIds(event.message);
        state.stepToolCallCount =
          toolCallIds.length > 0 ? toolCallIds.length : undefined;
        for (const toolCallId of toolCallIds) {
          state.pendingStepToolCallIds.add(toolCallId);
        }
      } else {
        state.pendingStepToolCallIds.clear();
        state.stepToolCallCount = undefined;
        parts.push(...finishStep(state));
      }
      return parts;
    }

    case 'tool_execution_start': {
      if (!event.toolCallId || !event.toolName) return [];
      const { wire, native } = resolveToolName(state, event.toolName);
      state.observedToolNames.set(event.toolCallId, wire);
      const { isMcpTool, providerExecuted } = resolveToolDispatch(
        state,
        native,
      );
      if (isMcpTool) state.dynamicToolCallIds.add(event.toolCallId);
      const input = serializeToolOutput(event.args ?? event.input ?? {});
      return [
        {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: wire,
          input,
          ...(wire !== native ? { nativeName: native } : {}),
          ...(providerExecuted ? { providerExecuted: true } : {}),
          ...(isMcpTool ? { dynamic: true } : {}),
          ...(state.stepToolCallCount != null
            ? { stepToolCallCount: state.stepToolCallCount }
            : {}),
        } as HarnessV1StreamPart,
      ];
    }

    case 'tool_execution_end':
    case 'tool_result': {
      if (!event.toolCallId) return [];
      const recordedName = state.observedToolNames.get(event.toolCallId);
      const nativeName = event.toolName;
      const wire =
        recordedName ??
        (nativeName ? resolveToolName(state, nativeName).wire : undefined);
      if (!wire) return [];
      const dynamic = state.dynamicToolCallIds.delete(event.toolCallId);
      /*
       * Prefer the exact value the host submitted for user-registered tools
       * (see `hostToolResults`). Built-in tools, whose results Pi produces and
       * reports as text, are not in the map and fall back to unwrapping the
       * event's text payload.
       */
      const result = state.hostToolResults.has(event.toolCallId)
        ? ((state.hostToolResults.get(event.toolCallId) ?? null) as Extract<
            HarnessV1StreamPart,
            { type: 'tool-result' }
          >['result'])
        : dynamic
          ? parseMcpToolResult(unwrapPiToolResult(event))
          : unwrapPiToolResult(event);
      state.hostToolResults.delete(event.toolCallId);
      state.pendingStepToolCallIds.delete(event.toolCallId);
      return [
        {
          type: 'tool-result',
          toolCallId: event.toolCallId,
          toolName: wire,
          result,
          ...(event.isError ? { isError: true } : {}),
          ...(dynamic ? { dynamic: true } : {}),
        } as HarnessV1StreamPart,
        ...finishStep(state),
      ];
    }

    case 'compaction_end': {
      /*
       * Pi performs the compaction itself; we observe its result. Skip aborted
       * or result-less compactions (nothing happened). A result with no summary
       * still represents a real compaction, so emit it with a placeholder
       * rather than dropping the event. `reason` is `'manual'` for an explicit
       * `session.compact()` call, `'threshold'`/`'overflow'` for Pi's automatic
       * compaction — both map to `'auto'` on the wire. Pi reports `tokensBefore`
       * but not `tokensAfter`.
       */
      if (event.aborted) return [];
      const result = event.result;
      if (!result || typeof result !== 'object') return [];
      const rawSummary = (result as { summary?: unknown }).summary;
      const summary =
        typeof rawSummary === 'string' ? rawSummary : '(no summary provided)';
      const tokensBefore = (result as { tokensBefore?: unknown }).tokensBefore;
      return [
        {
          type: 'compaction',
          trigger: event.reason === 'manual' ? 'manual' : 'auto',
          summary,
          ...(typeof tokensBefore === 'number' ? { tokensBefore } : {}),
        },
      ];
    }

    default:
      return [];
  }
}
