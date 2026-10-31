import {
  uiMessageChunkSchema,
  type ChatRequestOptions,
  type ChatTransport,
  type PrepareReconnectToStreamRequest,
  type PrepareSendMessagesRequest,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import {
  convertAsyncIteratorToReadableStream,
  getErrorMessage,
  safeParseJSON,
  type ParseResult,
} from '@ai-sdk/provider-utils';
import { createAsyncIterableStream } from 'ai/internal';
import {
  EventSourceParserStream,
  type EventSourceMessage,
} from 'eventsource-parser/stream';
import { normalizeUIMessageStreamParts } from './normalize-ui-message-stream.js';

/** One SSE event: the parsed chunk, and the `id` field when the server set one. */
type IdentifiedChunk = {
  readonly parsed: ParseResult<UIMessageChunk>;
  readonly id?: string;
};

/**
 * Parses an SSE body into UI message chunks, keeping each event's `id`.
 *
 * `parseJsonEventStream` from `@ai-sdk/provider-utils` drops the id, and the id
 * is what carries the server's stream cursor (see {@link streamCursorOf}), so
 * this transport does the same job one field wider.
 */
function parseIdentifiedUIMessageChunkStream(
  stream: ReadableStream<Uint8Array>,
): ReadableStream<IdentifiedChunk> {
  return stream
    .pipeThrough(
      new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>,
    )
    .pipeThrough(new EventSourceParserStream())
    .pipeThrough(
      new TransformStream<EventSourceMessage, IdentifiedChunk>({
        async transform({ data, id }, controller) {
          if (data === '[DONE]') return;
          controller.enqueue({
            parsed: await safeParseJSON({
              text: data,
              schema: uiMessageChunkSchema,
            }),
            ...(id === undefined ? {} : { id }),
          });
        },
      }),
    );
}

/**
 * The durable stream position an SSE event reports, or `undefined` when it
 * reports none.
 *
 * The transport's own count of UI chunks is NOT that position. A chunk too
 * large for one stored chunk is written across several, so the stream advances
 * further than the count does; resuming from the count lands behind the large
 * chunk and replays every chunk after it. A server that sets `id` to the
 * position it read each chunk from (`readable.position` in the Workflow SDK)
 * gives the transport the real cursor, and `id + 1` resumes exactly after it.
 *
 * Non-numeric ids are ignored rather than rejected: `id` is a free-form SSE
 * field and a server may already be using it for something else.
 */
function streamCursorOf(id: string | undefined): number | undefined {
  if (id === undefined || id === '') return undefined;
  const position = Number(id);
  return Number.isInteger(position) && position >= 0 ? position : undefined;
}

/**
 * Tracks `*-start` chunks the client has accepted so we can drop deltas/ends
 * that refer to a part whose start was emitted before the resume cursor.
 *
 * AI SDK's UI stream processor throws on `text-delta`/`reasoning-delta`/
 * `tool-input-delta` (and the matching `*-end`) when the start chunk for that
 * id was never observed, and on tool output/approval chunks when no tool part
 * exists for the call id. A negative `startIndex` on a flat chunk stream can
 * easily land mid-part, so without this guard the client crashes on resume.
 *
 * A tool part is established by `tool-input-start` OR by a self-contained
 * `tool-input-available`/`tool-input-error` chunk (the AI SDK creates the
 * part from those directly), so all three mark the call id as seen.
 *
 * This is a best-effort safety net — it preserves only the parts that the
 * resumed window includes a `*-start` for. Server-side rewinding to a step
 * boundary is the proper fix when you want the full message preserved.
 */
type OrphanFilter = {
  shouldDrop: (chunk: UIMessageChunk) => boolean;
};

function createOrphanFilter(): OrphanFilter {
  const seenStartedIds = new Set<string>();
  const seenStartedToolCallIds = new Set<string>();
  let warnedOnce = false;

  function warnOnce(orphanKind: string, orphanRef: string) {
    if (warnedOnce) return;
    warnedOnce = true;
    console.warn(
      '[WorkflowChatTransport] Dropping orphan UI chunk ' +
        `(${orphanKind} for id "${orphanRef}") on resume — ` +
        'the resume position landed mid-part. The dropped chunk(s) ' +
        "reference a part whose start chunk wasn't in the resumed " +
        'window. To preserve the full message, configure your ' +
        'stream endpoint to rewind to a step boundary before ' +
        'returning the readable. See: ' +
        'https://workflow.dev/docs/ai/resumable-streams#mid-part-resumes',
    );
  }

  function shouldDrop(chunk: UIMessageChunk): boolean {
    switch (chunk.type) {
      case 'reset-step':
        seenStartedIds.clear();
        seenStartedToolCallIds.clear();
        return false;
      case 'text-start':
      case 'reasoning-start':
        seenStartedIds.add(chunk.id);
        return false;
      case 'tool-input-start':
      // `tool-input-available` / `tool-input-error` are self-contained: the
      // AI SDK creates the tool part from them directly (non-streamed tool
      // calls are emitted as a bare `tool-input-available`), so they must
      // never be dropped. They also carry the full input, so they recover a
      // tool call whose `tool-input-start` fell outside the resumed window.
      case 'tool-input-available':
      case 'tool-input-error':
        seenStartedToolCallIds.add(chunk.toolCallId);
        return false;
      case 'text-delta':
      case 'text-end':
      case 'reasoning-delta':
      case 'reasoning-end':
        if (seenStartedIds.has(chunk.id)) return false;
        warnOnce(chunk.type, chunk.id);
        return true;
      case 'tool-input-delta':
      case 'tool-approval-request':
      case 'tool-output-available':
      case 'tool-output-error':
      case 'tool-output-denied':
        if (seenStartedToolCallIds.has(chunk.toolCallId)) return false;
        warnOnce(chunk.type, chunk.toolCallId);
        return true;
      default:
        return false;
    }
  }

  return { shouldDrop };
}

export interface SendMessagesOptions<UI_MESSAGE extends UIMessage> {
  trigger: 'submit-message' | 'regenerate-message';
  chatId: string;
  messageId?: string;
  messages: UI_MESSAGE[];
  abortSignal?: AbortSignal;
}

export interface ReconnectToStreamOptions {
  chatId: string;
  abortSignal?: AbortSignal;
  /**
   * Override the `startIndex` for this reconnection.
   * Negative values read from the end when the server's durable stream and
   * tail-index header use the same UIMessageChunk index space.
   * When omitted, falls back to the constructor's `initialStartIndex`.
   */
  startIndex?: number;
}

type OnChatSendMessage<UI_MESSAGE extends UIMessage> = (
  response: Response,
  options: SendMessagesOptions<UI_MESSAGE>,
) => void | Promise<void>;

type OnChatEnd = ({
  chatId,
  chunkIndex,
}: {
  chatId: string;
  chunkIndex: number;
}) => void | Promise<void>;

/**
 * Configuration options for the WorkflowChatTransport.
 *
 * @template UI_MESSAGE - The type of UI messages being sent and received,
 *                        must extend the UIMessage interface from the AI SDK.
 */
export interface WorkflowChatTransportOptions<UI_MESSAGE extends UIMessage> {
  /**
   * API endpoint for chat requests
   * Defaults to /api/chat if not provided
   */
  api?: string;

  /**
   * Custom fetch implementation to use for HTTP requests.
   * Defaults to the global fetch function if not provided.
   */
  fetch?: typeof fetch;

  /**
   * Callback invoked after successfully sending messages to the chat endpoint.
   * Useful for tracking chat history and inspecting response headers.
   *
   * @param response - The HTTP response object from the chat endpoint
   * @param options - The original options passed to sendMessages
   */
  onChatSendMessage?: OnChatSendMessage<UI_MESSAGE>;

  /**
   * Callback invoked when a chat stream ends (receives a "finish" chunk).
   * Useful for cleanup operations or state updates.
   *
   * @param chatId - The ID of the chat that ended
   * @param chunkIndex - The total number of chunks received
   */
  onChatEnd?: OnChatEnd;

  /**
   * Maximum number of consecutive errors allowed during reconnection attempts.
   * Streams that end without receiving any UI message chunks count as errors.
   * Defaults to 3 if not provided.
   */
  maxConsecutiveErrors?: number;

  /**
   * Default `startIndex` to use when reconnecting to a stream without a known
   * chunk position (i.e. the initial reconnection, not a retry).
   * Negative values read from the end of a durable UIMessageChunk stream (e.g.
   * `-10` fetches the last 10 chunks), which is useful for resuming a chat UI
   * after a page refresh without replaying the full conversation. Raw
   * ModelCallStreamPart streams do not support negative UI chunk indexes.
   *
   * Can be overridden per-call via `ReconnectToStreamOptions.startIndex`.
   *
   * Defaults to `0` (replay from the beginning).
   */
  initialStartIndex?: number;

  /**
   * Function to prepare the request for sending messages.
   * Allows customizing the API endpoint, headers, credentials, and body.
   */
  prepareSendMessagesRequest?: PrepareSendMessagesRequest<UI_MESSAGE>;

  /**
   * Function to prepare the request for reconnecting to a stream.
   * Allows customizing the API endpoint, headers, and credentials.
   */
  prepareReconnectToStreamRequest?: PrepareReconnectToStreamRequest;
}

/**
 * A transport implementation for managing chat workflows with support for
 * streaming responses and automatic reconnection to interrupted streams.
 *
 * This class implements the ChatTransport interface from the AI SDK and provides
 * reliable message streaming with automatic recovery from network interruptions
 * or function timeouts.
 *
 * @template UI_MESSAGE - The type of UI messages being sent and received,
 *                        must extend the UIMessage interface from the AI SDK.
 *
 * @implements {ChatTransport<UI_MESSAGE>}
 */
export class WorkflowChatTransport<
  UI_MESSAGE extends UIMessage,
> implements ChatTransport<UI_MESSAGE> {
  private readonly api: string;
  private readonly fetch: typeof fetch;
  private readonly onChatSendMessage?: OnChatSendMessage<UI_MESSAGE>;
  private readonly onChatEnd?: OnChatEnd;
  private readonly maxConsecutiveErrors: number;
  private readonly initialStartIndex: number;
  private readonly prepareSendMessagesRequest?: PrepareSendMessagesRequest<UI_MESSAGE>;
  private readonly prepareReconnectToStreamRequest?: PrepareReconnectToStreamRequest;

  /**
   * Creates a new WorkflowChatTransport instance.
   *
   * @param options - Configuration options for the transport
   * @param options.api - API endpoint for chat requests (defaults to '/api/chat')
   * @param options.fetch - Custom fetch implementation (defaults to global fetch)
   * @param options.onChatSendMessage - Callback after sending messages
   * @param options.onChatEnd - Callback when chat stream ends
   * @param options.maxConsecutiveErrors - Maximum consecutive errors for reconnection
   * @param options.prepareSendMessagesRequest - Function to prepare send messages request
   * @param options.prepareReconnectToStreamRequest - Function to prepare reconnect request
   */
  constructor(options: WorkflowChatTransportOptions<UI_MESSAGE> = {}) {
    this.api = options.api ?? '/api/chat';
    this.fetch = options.fetch ?? fetch.bind(globalThis);
    this.onChatSendMessage = options.onChatSendMessage;
    this.onChatEnd = options.onChatEnd;
    this.maxConsecutiveErrors = options.maxConsecutiveErrors ?? 3;
    this.initialStartIndex = options.initialStartIndex ?? 0;
    this.prepareSendMessagesRequest = options.prepareSendMessagesRequest;
    this.prepareReconnectToStreamRequest =
      options.prepareReconnectToStreamRequest;
  }

  /**
   * Sends messages to the chat endpoint and returns a stream of response chunks.
   *
   * This method handles the entire chat lifecycle including:
   * - Sending messages to the /api/chat endpoint
   * - Streaming response chunks
   * - Automatic reconnection if the stream is interrupted
   *
   * @param options - Options for sending messages
   * @param options.trigger - The type of message submission ('submit-message' or 'regenerate-message')
   * @param options.chatId - Unique identifier for this chat session
   * @param options.messageId - Optional message ID for tracking specific messages
   * @param options.messages - Array of UI messages to send
   * @param options.abortSignal - Optional AbortSignal to cancel the request
   *
   * @returns A ReadableStream of UIMessageChunk objects containing the response
   * @throws Error if the fetch request fails or returns a non-OK status
   */
  async sendMessages(
    options: SendMessagesOptions<UI_MESSAGE> & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    return convertAsyncIteratorToReadableStream(
      normalizeUIMessageStreamParts(this.sendMessagesIterator(options)),
    );
  }

  private async *sendMessagesIterator(
    options: SendMessagesOptions<UI_MESSAGE> & ChatRequestOptions,
  ): AsyncGenerator<UIMessageChunk> {
    const { chatId, messages, abortSignal, trigger, messageId } = options;

    // We keep track of if the "finish" chunk is received to determine
    // if we need to reconnect, and keep track of the chunk index to resume from.
    let gotFinish = false;
    let chunkIndex = 0;
    // The last durable position the server reported, when it reports any.
    let streamCursor: number | undefined;

    // Prepare the request using the configurator if provided
    const requestConfig = this.prepareSendMessagesRequest
      ? await this.prepareSendMessagesRequest({
          id: chatId,
          messages,
          requestMetadata: options.metadata,
          body: options.body,
          credentials: undefined,
          headers: options.headers,
          api: this.api,
          trigger,
          messageId,
        })
      : undefined;

    const url = requestConfig?.api ?? this.api;
    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(
        requestConfig?.body ?? { messages, ...options.body },
      ),
      headers: requestConfig?.headers,
      credentials: requestConfig?.credentials,
      signal: abortSignal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to fetch chat: ${response.status} ${await response.text()}`,
      );
    }

    const workflowRunId = response.headers.get('x-workflow-run-id');
    if (!workflowRunId) {
      throw new Error(
        'Workflow run ID not found in "x-workflow-run-id" response header',
      );
    }

    // Notify the caller that the chat POST request was sent.
    // This is useful for tracking the chat history on the client
    // side and allows for inspecting response headers.
    await this.onChatSendMessage?.(response, options);

    // Flush the initial stream until the end or an error occurs
    try {
      const chunkStream = parseIdentifiedUIMessageChunkStream(response.body);
      for await (const chunk of createAsyncIterableStream(chunkStream)) {
        if (!chunk.parsed.success) {
          throw chunk.parsed.error;
        }

        chunkIndex++;
        streamCursor = streamCursorOf(chunk.id) ?? streamCursor;

        yield chunk.parsed.value;

        if (chunk.parsed.value.type === 'finish') {
          gotFinish = true;
        }
      }
    } catch (error) {
      console.error('Error in chat POST stream', error);
    }

    if (gotFinish) {
      await this.onFinish(gotFinish, { chatId, chunkIndex });
    } else {
      // If the initial POST request did not include the "finish" chunk,
      // we need to reconnect to the stream. This could indicate that a
      // network error occurred or the Vercel Function timed out.
      yield* this.reconnectToStreamIterator(
        options,
        workflowRunId,
        chunkIndex,
        streamCursor,
      );
    }
  }

  /**
   * Reconnects to an existing chat stream that was previously interrupted.
   *
   * This method is useful for resuming a chat session after network issues,
   * page refreshes, or Vercel Function timeouts.
   *
   * @param options - Options for reconnecting to the stream
   * @param options.chatId - The chat ID to reconnect to
   *
   * @returns A ReadableStream of UIMessageChunk objects
   * @throws Error if the reconnection request fails or returns a non-OK status
   */
  async reconnectToStream(
    options: ReconnectToStreamOptions & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    const reconnectIterator = normalizeUIMessageStreamParts(
      this.reconnectToStreamIterator(options),
    );
    return convertAsyncIteratorToReadableStream(reconnectIterator);
  }

  private async *reconnectToStreamIterator(
    options: ReconnectToStreamOptions & ChatRequestOptions,
    workflowRunId?: string,
    initialChunkIndex = 0,
    initialStreamCursor?: number,
  ): AsyncGenerator<UIMessageChunk> {
    let chunkIndex = initialChunkIndex;
    // The durable position the server last reported, via the SSE `id` field.
    // When present it supersedes `chunkIndex` as the resume position: the two
    // agree only while every UI chunk occupies exactly one stored chunk, and a
    // chunk too large for one stored chunk breaks that, leaving `chunkIndex`
    // behind the real position and replaying what it skipped past.
    let streamCursor = initialStreamCursor;

    // When called from the public reconnectToStream (initialChunkIndex === 0),
    // honour the caller's startIndex (or the constructor default) for the
    // first request. This enables negative values so the client can read only
    // the tail of the stream (e.g. the last 10 chunks) instead of replaying
    // everything. After the first request, fall back to the running chunkIndex
    // so that retries resume from the correct position.
    const explicitStartIndex = options.startIndex ?? this.initialStartIndex;
    let useExplicitStartIndex =
      initialChunkIndex === 0 && explicitStartIndex !== 0;

    const defaultApi = `${this.api}/${encodeURIComponent(workflowRunId ?? options.chatId)}/stream`;

    // Prepare the request using the configurator if provided
    const requestConfig = this.prepareReconnectToStreamRequest
      ? await this.prepareReconnectToStreamRequest({
          id: options.chatId,
          requestMetadata: options.metadata,
          body: undefined,
          credentials: undefined,
          headers: undefined,
          api: defaultApi,
        })
      : undefined;

    const baseUrl = requestConfig?.api ?? defaultApi;

    let gotFinish = false;
    let consecutiveErrors = 0;
    // When a negative startIndex is used but the tail-index header is absent,
    // retries fall back to startIndex 0 (replay everything) instead of using
    // the incremental chunkIndex which would be wrong.
    let replayFromStart = false;

    // When resuming with a negative startIndex, the resolved chunk can land in
    // the middle of a `*-start` / `*-delta` / `*-end` sequence, which crashes
    // the AI SDK UI stream processor. The orphan filter drops chunks whose
    // start chunk was emitted before the resume window. Only activated for
    // negative resumes — non-negative startIndex is the caller's explicit
    // choice and we trust them. See: https://github.com/vercel/workflow/issues/1835
    const orphanFilter =
      useExplicitStartIndex && explicitStartIndex < 0
        ? createOrphanFilter()
        : null;

    while (!gotFinish) {
      const startIndex = useExplicitStartIndex
        ? explicitStartIndex
        : // A reported position is exact, so it beats both fallbacks.
          streamCursor !== undefined
          ? streamCursor + 1
          : replayFromStart
            ? 0
            : chunkIndex;

      const url = `${baseUrl}?startIndex=${startIndex}`;
      const response = await this.fetch(url, {
        headers: requestConfig?.headers,
        credentials: requestConfig?.credentials,
        signal: options.abortSignal,
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to fetch chat: ${response.status} ${await response.text()}`,
        );
      }

      // When using a negative startIndex, the server resolves it to an
      // absolute position. The reconnection endpoint should return the tail
      // index so we can compute the resolved position for subsequent retries.
      if (useExplicitStartIndex && explicitStartIndex > 0) {
        // Positive startIndex: the first request starts at this absolute
        // position, so set chunkIndex to match so subsequent retries
        // resume from (explicitStartIndex + chunks received).
        chunkIndex = explicitStartIndex;
      } else if (useExplicitStartIndex && explicitStartIndex < 0) {
        const tailIndexHeader = response.headers.get(
          'x-workflow-stream-tail-index',
        );
        const tailIndex =
          tailIndexHeader !== null ? parseInt(tailIndexHeader, 10) : NaN;

        if (!Number.isNaN(tailIndex)) {
          // Resolve: e.g. tailIndex=499, startIndex=-20 → 500 + (-20) = 480
          chunkIndex = Math.max(0, tailIndex + 1 + explicitStartIndex);
        } else {
          // Header missing or unparseable — fall back to replaying from the
          // beginning so retries don't resume from a wrong position.
          console.warn(
            '[WorkflowChatTransport] Negative initialStartIndex is configured ' +
              `(${explicitStartIndex}) but the reconnection endpoint did not ` +
              'return a valid "x-workflow-stream-tail-index" header. Unless ' +
              'the stream reports its own positions as SSE event ids, retries ' +
              'will replay the stream from the beginning. See: ' +
              'https://workflow.dev/docs/ai/resumable-streams#resuming-from-the-end-of-the-stream',
          );
          replayFromStart = true;
        }
      }
      useExplicitStartIndex = false;

      try {
        const streamStartIndex = chunkIndex;
        const chunkStream = parseIdentifiedUIMessageChunkStream(response.body);
        for await (const chunk of createAsyncIterableStream(chunkStream)) {
          if (!chunk.parsed.success) {
            throw chunk.parsed.error;
          }

          chunkIndex++;
          streamCursor = streamCursorOf(chunk.id) ?? streamCursor;

          if (orphanFilter?.shouldDrop(chunk.parsed.value)) continue;

          yield chunk.parsed.value;

          if (chunk.parsed.value.type === 'finish') {
            gotFinish = true;
          }
        }
        if (chunkIndex === streamStartIndex) {
          throw new Error('Reconnect stream ended without receiving chunks.');
        }
        // Reset consecutive errors only after successful parsing with progress.
        consecutiveErrors = 0;
      } catch (error) {
        console.error('Error in chat GET reconnectToStream', error);
        consecutiveErrors++;

        if (consecutiveErrors >= this.maxConsecutiveErrors) {
          throw new Error(
            `Failed to reconnect after ${this.maxConsecutiveErrors} consecutive errors. Last error: ${getErrorMessage(error)}`,
          );
        }
      }
    }

    await this.onFinish(gotFinish, { chatId: options.chatId, chunkIndex });
  }

  private async onFinish(
    gotFinish: boolean,
    { chatId, chunkIndex }: { chatId: string; chunkIndex: number },
  ) {
    if (gotFinish) {
      await this.onChatEnd?.({ chatId, chunkIndex });
    } else {
      throw new Error('No finish chunk received');
    }
  }
}
