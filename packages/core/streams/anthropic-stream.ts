import {
  AIStream,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

// from anthropic sdk (Completion)
interface CompletionChunk {
  /**
   * Unique object identifier.
   *
   * The format and length of IDs may change over time.
   */
  id: string;

  /**
   * The resulting completion up to and excluding the stop sequences.
   */
  completion: string;

  /**
   * The model that handled the request.
   */
  model: string;

  /**
   * The reason that we stopped.
   *
   * This may be one the following values:
   *
   * - `"stop_sequence"`: we reached a stop sequence — either provided by you via the
   *   `stop_sequences` parameter, or a stop sequence built into the model
   * - `"max_tokens"`: we exceeded `max_tokens_to_sample` or the model's maximum
   */
  stop_reason: string | null;

  /**
   * Object type.
   *
   * For Text Completions, this is always `"completion"`.
   */
  type: 'completion';
}

interface StreamError {
  error: {
    type: string;
    message: string;
  };
}

interface StreamPing {}

type StreamData = CompletionChunk | StreamError | StreamPing;

interface Message {
  id: string;
  content: Array<ContentBlock>;
  model: string;
  role: 'assistant';
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  type: 'message';
}

interface ContentBlock {
  text: string;
  type: 'text';
}

interface TextDelta {
  text: string;
  type: 'text_delta';
}

interface ContentBlockDeltaEvent {
  delta: TextDelta;
  index: number;
  type: 'content_block_delta';
}

interface ContentBlockStartEvent {
  content_block: ContentBlock;
  index: number;
  type: 'content_block_start';
}

interface ContentBlockStopEvent {
  index: number;
  type: 'content_block_stop';
}

interface MessageDeltaEventDelta {
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
}

interface MessageDeltaEvent {
  delta: MessageDeltaEventDelta;
  type: 'message_delta';
}

type MessageStreamEvent =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent;

interface MessageStartEvent {
  message: Message;
  type: 'message_start';
}

interface MessageStopEvent {
  type: 'message_stop';
}

function parseAnthropicStream(): (data: string) => string | void {
  let previous = '';

  return data => {
    const json = JSON.parse(data as string) as StreamData;

    // error event
    if ('error' in json) {
      throw new Error(`${json.error.type}: ${json.error.message}`);
    }

    // ping event
    if (!('completion' in json)) {
      return;
    }

    // On API versions older than 2023-06-01,
    // Anthropic's `completion` field is cumulative unlike OpenAI's
    // deltas. In order to compute the delta, we must slice out the text
    // we previously received.
    const text = json.completion;
    if (
      !previous ||
      (text.length > previous.length && text.startsWith(previous))
    ) {
      const delta = text.slice(previous.length);
      previous = text;

      return delta;
    }

    return text;
  };
}

async function* streamable(
  stream: AsyncIterable<CompletionChunk> | AsyncIterable<MessageStreamEvent>,
) {
  for await (const chunk of stream) {
    if ('completion' in chunk) {
      // completion stream
      const text = chunk.completion;
      if (text) yield text;
    } else if ('delta' in chunk) {
      // messge stream
      const { delta } = chunk;
      if ('text' in delta) {
        const text = delta.text;
        if (text) yield text;
      }
    }
  }
}

/**
 * Accepts either a fetch Response from the Anthropic `POST /v1/complete` endpoint,
 * or the return value of `await client.completions.create({ stream: true })`
 * from the `@anthropic-ai/sdk` package.
 */
export function AnthropicStream(
  res:
    | Response
    | AsyncIterable<CompletionChunk>
    | AsyncIterable<MessageStreamEvent>,
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  if (Symbol.asyncIterator in res) {
    return readableFromAsyncIterable(streamable(res))
      .pipeThrough(createCallbacksTransformer(cb))
      .pipeThrough(createStreamDataTransformer());
  } else {
    return AIStream(res, parseAnthropicStream(), cb).pipeThrough(
      createStreamDataTransformer(),
    );
  }
}
