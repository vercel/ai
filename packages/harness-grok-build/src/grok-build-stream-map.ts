import type { HarnessV1StreamPart } from '@ai-sdk/harness';

// Extract V4 types from the finish part shape rather than importing from
// @ai-sdk/provider directly (not listed in package.json dependencies).
type FinishPart = Extract<HarnessV1StreamPart, { type: 'finish' }>;
type LanguageModelV4FinishReason = FinishPart['finishReason'];
type LanguageModelV4Usage = FinishPart['totalUsage'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type StreamMapState = {
  /** Whether we have already emitted a stream-start event. */
  streamStarted: boolean;
  /** Id of the currently open text block, or null. */
  openTextId: string | null;
  /** Id of the currently open reasoning block, or null. */
  openReasoningId: string | null;
  /** Counter used to mint unique block ids. */
  nextId: number;
};

export function createStreamMapState(): StreamMapState {
  return {
    streamStarted: false,
    openTextId: null,
    openReasoningId: null,
    nextId: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mintId(state: StreamMapState, prefix: string): string {
  return `${prefix}_${state.nextId++}`;
}

/**
 * Zero usage object.
 *
 * NOTE: token usage is unavailable in `grok --output-format streaming-json`
 * mode — the CLI does not emit usage data in this surface. Reporting zeros
 * here is intentional; real usage figures will be available once the ACP
 * (Agent Communication Protocol) surface is supported (future follow-up).
 */
function unknownUsage(): LanguageModelV4Usage {
  // streaming-json mode reports no token counts. Use `undefined` (not 0) so
  // downstream consumers can distinguish "not reported" from "zero tokens used".
  // Real usage will be available via the ACP surface (future follow-up).
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

function mapStopReason(raw: string | undefined): LanguageModelV4FinishReason {
  switch (raw) {
    case 'EndTurn':
      return { unified: 'stop', raw };
    case 'MaxTokens':
      return { unified: 'length', raw };
    case 'ToolUse':
      return { unified: 'tool-calls', raw };
    case 'ContentFilter':
      return { unified: 'content-filter', raw };
    case 'Error':
      return { unified: 'error', raw };
    default:
      return { unified: 'other', raw };
  }
}

// ---------------------------------------------------------------------------
// Core mapping
// ---------------------------------------------------------------------------

/**
 * Map one raw (newline-delimited) JSON line from `grok -p ... --output-format
 * streaming-json` to zero or more `HarnessV1StreamPart` events.
 *
 * Three event shapes exist in this mode:
 *   - `{"type":"thought","data":"<chunk>"}` — reasoning text delta
 *   - `{"type":"text","data":"<chunk>"}` — assistant text delta
 *   - `{"type":"end","stopReason":"EndTurn","sessionId":"...","requestId":"..."}` — terminal
 *
 * Tool-call/tool-result/file-change events and token usage are NOT emitted
 * here — they are unavailable in this CLI surface and are a future follow-up
 * via the ACP surface.
 *
 * Pure function with mutable state passed in — no I/O, never throws.
 */
export function mapStreamLine(
  rawLine: string,
  state: StreamMapState,
): HarnessV1StreamPart[] {
  // Safe parse — return [] on any error, never throw.
  // NOTE: `safeParseJSON` from `@ai-sdk/provider-utils` is async and cannot be
  // used in a synchronous line processor. We use a local try/catch here which
  // is semantically equivalent to the sync core of `safeParseJSON` (no schema
  // validation needed — we validate shapes via runtime property access below).
  let msg: unknown;
  try {
    msg = JSON.parse(rawLine);
  } catch {
    return [];
  }
  if (typeof msg !== 'object' || msg === null) return [];

  const anyMsg = msg as Record<string, unknown>;
  const eventType = anyMsg['type'] as string | undefined;

  const parts: HarnessV1StreamPart[] = [];

  // Emit stream-start exactly once, before any other event.
  function ensureStreamStart() {
    if (!state.streamStarted) {
      state.streamStarted = true;
      parts.push({ type: 'stream-start' });
    }
  }

  // Close an open text block if any.
  function closeTextBlock() {
    if (state.openTextId !== null) {
      parts.push({ type: 'text-end', id: state.openTextId });
      state.openTextId = null;
    }
  }

  // Close an open reasoning block if any.
  function closeReasoningBlock() {
    if (state.openReasoningId !== null) {
      parts.push({ type: 'reasoning-end', id: state.openReasoningId });
      state.openReasoningId = null;
    }
  }

  ensureStreamStart();

  switch (eventType) {
    case 'thought': {
      const data = typeof anyMsg['data'] === 'string' ? anyMsg['data'] : '';

      // If a text block is somehow open, close it first (shouldn't normally happen).
      closeTextBlock();

      // Open reasoning block if not already open.
      if (state.openReasoningId === null) {
        const id = mintId(state, 'reasoning');
        state.openReasoningId = id;
        parts.push({ type: 'reasoning-start', id });
      }

      parts.push({
        type: 'reasoning-delta',
        id: state.openReasoningId,
        delta: data,
      });
      break;
    }

    case 'text': {
      const data = typeof anyMsg['data'] === 'string' ? anyMsg['data'] : '';

      // Close any open reasoning block before switching to text.
      closeReasoningBlock();

      // Open text block if not already open.
      if (state.openTextId === null) {
        const id = mintId(state, 'text');
        state.openTextId = id;
        parts.push({ type: 'text-start', id });
      }

      parts.push({
        type: 'text-delta',
        id: state.openTextId,
        delta: data,
      });
      break;
    }

    case 'end': {
      // Close any open blocks.
      closeReasoningBlock();
      closeTextBlock();

      const stopReason = anyMsg['stopReason'] as string | undefined;

      parts.push({
        type: 'finish',
        finishReason: mapStopReason(stopReason),
        // NOTE: usage is unavailable in streaming-json mode; zeros are intentional.
        // Real token counts will be available via the ACP surface (future follow-up).
        totalUsage: unknownUsage(),
      });
      break;
    }

    default: {
      // Unknown event type → raw passthrough.
      parts.push({ type: 'raw', rawValue: msg });
      break;
    }
  }

  return parts;
}
