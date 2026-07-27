import type { ParseResult } from '@ai-sdk/provider-utils';
import type { OpenAIResponsesChunk } from './openai-responses-api';

/**
 * Session key for the shared connection. A single `generateText` /
 * `streamText` call gets one socket, so the key is fixed rather than derived
 * from the URL or model id.
 */
export const OPENAI_RESPONSES_WEBSOCKET_SESSION_KEY =
  'openai.responses.websocket';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet.`);
};

/**
 * Pure delta rule for Responses WebSocket continuation.
 *
 * When `sentItems` is a structural prefix of the new items, returns only the
 * tail and marks the turn as a continuation, so the caller sends
 * `previous_response_id` plus the new items. Otherwise — a middleware rewrote
 * or dropped history — returns the full input and drops the chain.
 */
export function computeResponsesInputDelta(_options: {
  sentItems: string[];
  items: unknown[];
}): { input: unknown[]; isContinuation: boolean } {
  return notImplemented('computeResponsesInputDelta');
}

/**
 * Recognises OpenAI's WebSocket error frames.
 *
 * These carry no `sequence_number`, so `openaiResponsesChunkSchema` would
 * classify them as `unknown_chunk`. The connection layer parses them out
 * before chunks reach the shared response pipeline.
 */
export function parseWebSocketErrorFrame(
  _value: unknown,
): OpenAIResponsesWebSocketError | undefined {
  return notImplemented('parseWebSocketErrorFrame');
}

export type OpenAIResponsesWebSocketError = {
  code: string | undefined;
  message: string;
  status: number | undefined;
  frame: unknown;
};

export type OpenAIResponsesWebSocket = {
  /**
   * Whether a chain exists, so `getArgs` can skip items already in it.
   * Call `ensureConnected()` first so a dead socket does not leave a stale
   * chain in place.
   */
  readonly isContinuation: boolean;

  /**
   * Opens a socket when needed. A new socket always resets the chain, because
   * OpenAI's `previous_response_id` cache is connection-local.
   */
  ensureConnected(): Promise<void>;

  /**
   * Applies the delta, sends `response.create`, and returns the server event
   * stream, already advanced past the pre-output error check so a single
   * reconnect on `previous_response_not_found` /
   * `websocket_connection_limit_reached` is transparent to the caller.
   */
  createResponse(options: {
    args: Record<string, unknown>;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<ParseResult<OpenAIResponsesChunk>>>;

  close(): void;
};

/**
 * Creates the connection held in `experimental_session` for the lifetime of a
 * single `generateText` / `streamText` call. Connects eagerly so the handshake
 * overlaps argument construction.
 */
export function createOpenAIResponsesWebSocket(_options: {
  url: URL;
  headers: Record<string, string | undefined>;
}): OpenAIResponsesWebSocket {
  return notImplemented('createOpenAIResponsesWebSocket');
}
