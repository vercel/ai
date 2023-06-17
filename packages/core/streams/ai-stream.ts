import {
  createParser,
  type EventSourceParser,
  type ParsedEvent,
  type ReconnectInterval,
} from 'eventsource-parser';

/**
 * Interface representing callbacks for an AIStream.
 * @interface
 */
export interface AIStreamCallbacks {
  onStart?: () => Promise<void>;
  onCompletion?: (completion: string) => Promise<void>;
  onToken?: (token: string) => Promise<void>;
}

/**
 * Interface representing a custom parser for AIStream data.
 * @interface
 */
export interface AIStreamParser {
  (data: string): string | void;
}

/**
 * Creates a transform stream that parses events from an EventSource stream.
 * @param {AIStreamParser} customParser - A custom parser function.
 * @return {TransformStream<Uint8Array, string>} A transform stream.
 */
export function createEventStreamTransformer(customParser: AIStreamParser): TransformStream<Uint8Array, string> {
  const textDecoder = new TextDecoder();
  let eventSourceParser: EventSourceParser;

  return new TransformStream({
    async start(controller): Promise<void> {
      eventSourceParser = createParser((event: ParsedEvent | ReconnectInterval) => {
        if ('data' in event && event.type === 'event' && event.data === '[DONE]') {
          controller.terminate();
          return;
        }
    
        if ('data' in event) {
          const parsedMessage = customParser(event.data);
          if (parsedMessage) controller.enqueue(parsedMessage);
        }
      });
    },

    transform(chunk) {
      eventSourceParser.feed(textDecoder.decode(chunk));
    },
  });
}

/**
 * Creates a transform stream that calls back with messages.
 * @param {AIStreamCallbacks} callbacks - The callbacks.
 * @return {TransformStream<string, Uint8Array>} A transform stream.
 */
export function createCallbacksTransformer(
  callbacks: AIStreamCallbacks | undefined
): TransformStream<string, Uint8Array> {
  const textEncoder = new TextEncoder();
  let aggregatedResponse = '';
  const { onStart, onToken, onCompletion } = callbacks || {};

  return new TransformStream({
    async start(): Promise<void> {
      if (onStart) await onStart();
    },

    async transform(message, controller): Promise<void> {
      controller.enqueue(textEncoder.encode(message));

      if (onToken) await onToken(message);
      if (onCompletion) aggregatedResponse += message;
    },

    async flush(): Promise<void> {
      if (onCompletion) await onCompletion(aggregatedResponse);
    },
  });
}

/**
 * Creates a function to trim the start of a stream.
 * @return {Function} A function that trims the start of a stream.
 */
export function trimStartOfStreamHelper(): (text: string) => string {
  let isStreamStart = true;

  return (text: string): string => {
    if (isStreamStart) {
      text = text.trimStart();
      if (text) isStreamStart = false;
    }
    return text;
  };
}

/**
 * Creates an AIStream from the response.
 * @param {Response} response - The response.
 * @param {AIStreamParser} customParser - The custom parser function.
 * @param {AIStreamCallbacks} callbacks - The callbacks.
 * @return {ReadableStream} The AIStream.
 * @throws Will throw an error if the response is not OK.
 */
export function AIStream(
  response: Response,
  customParser: AIStreamParser,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  if (!response.ok) {
    throw new Error(`Failed to convert the response to stream. Received status code: ${response.status}.`);
  }

  const responseBodyStream = response.body || createEmptyReadableStream();

  return responseBodyStream
    .pipeThrough(createEventStreamTransformer(customParser))
    .pipeThrough(createCallbacksTransformer(callbacks));
}

/**
 * Creates an empty ReadableStream.
 * @return {ReadableStream} An empty ReadableStream.
 */
function createEmptyReadableStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}
