import type { HarnessV1StreamPart } from '@ai-sdk/harness';

// V4 types via the finish part shape (@ai-sdk/provider isn't a dependency).
type FinishPart = Extract<HarnessV1StreamPart, { type: 'finish' }>;
type LanguageModelV4FinishReason = FinishPart['finishReason'];
type LanguageModelV4Usage = FinishPart['totalUsage'];

export type StreamMapState = {
  streamStarted: boolean;
  openTextId: string | null;
  openReasoningId: string | null;
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

function mintId(state: StreamMapState, prefix: string): string {
  return `${prefix}_${state.nextId++}`;
}

// streaming-json reports no token counts; `undefined` (not 0) signals "not reported".
function unknownUsage(): LanguageModelV4Usage {
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

// Map one streaming-json line (`thought`/`text`/`end`) to stream parts. Pure, never throws.
export function mapStreamLine(
  rawLine: string,
  state: StreamMapState,
): HarnessV1StreamPart[] {
  // JSON.parse, not async safeParseJSON, since this runs per line synchronously.
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

  switch (eventType) {
    case 'thought': {
      const data = typeof anyMsg['data'] === 'string' ? anyMsg['data'] : '';

      closeTextBlock();
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

      closeReasoningBlock();
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
        totalUsage: unknownUsage(),
      });
      break;
    }

    default: {
      parts.push({ type: 'raw', rawValue: msg });
      break;
    }
  }

  return parts;
}
