import {
  createParser,
  EventSourceMessage,
  type EventSourceParser,
} from 'eventsource-parser';

export interface FunctionCallPayload {
  name: string;
  arguments: Record<string, unknown>;
}
export interface ToolCallPayload {
  tools: {
    id: string;
    type: 'function';
    func: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }[];
}

/**
 * Configuration options and helper callback methods for AIStream stream lifecycle events.
 * @interface
 */
export interface AIStreamCallbacksAndOptions {
  /** `onStart`: Called once when the stream is initialized. */
  onStart?: () => Promise<void> | void;
  /** `onCompletion`: Called for each tokenized message. */
  onCompletion?: (completion: string) => Promise<void> | void;
  /** `onFinal`: Called once when the stream is closed with the final completion message. */
  onFinal?: (completion: string) => Promise<void> | void;
  /** `onToken`: Called for each tokenized message. */
  onToken?: (token: string) => Promise<void> | void;
  /** `onText`: Called for each text chunk. */
  onText?: (text: string) => Promise<void> | void;
  /**
   * @deprecated This flag is no longer used and only retained for backwards compatibility.
   * You can remove it from your code.
   */
  experimental_streamData?: boolean;
}

/**
 * Options for the AIStreamParser.
 * @interface
 * @property {string} event - The event (type) from the server side event stream.
 */
export interface AIStreamParserOptions {
  event?: string;
}

/**
 * Custom parser for AIStream data.
 * @interface
 * @param {string} data - The data to be parsed.
 * @param {AIStreamParserOptions} options - The options for the parser.
 * @returns {string | void} The parsed data or void.
 */
export interface AIStreamParser {
  (data: string, options: AIStreamParserOptions):
    | string
    | void
    | { isText: false; content: string };
}

/**
 * Creates a TransformStream that parses events from an EventSource stream using a custom parser.
 * @param {AIStreamParser} customParser - Function to handle event data.
 * @returns {TransformStream<Uint8Array, string>} TransformStream parsing events.
 */
function createEventStreamTransformer(
  customParser?: AIStreamParser,
): TransformStream<Uint8Array, string | { isText: false; content: string }> {
  const textDecoder = new TextDecoder();
  let eventSourceParser: EventSourceParser;

  return new TransformStream({
    async start(controller): Promise<void> {
      eventSourceParser = createParser({
        onEvent: (message: EventSourceMessage) => {
          if (
            ('data' in message &&
              message.event === 'event' &&
              message.data === '[DONE]') ||
            // Replicate doesn't send [DONE] but does send a 'done' event
            // @see https://replicate.com/docs/streaming
            (message as any).event === 'done'
          ) {
            controller.terminate();
            return;
          }

          if ('data' in message) {
            const parsedMessage = customParser
              ? customParser(message.data, {
                  event: message.event,
                })
              : message.data;
            if (parsedMessage) controller.enqueue(parsedMessage);
          }
        },
      });
    },

    transform(chunk) {
      eventSourceParser.feed(textDecoder.decode(chunk));
    },
  });
}

/**
 * Creates a transform stream that encodes input messages and invokes optional callback functions.
 * The transform stream uses the provided callbacks to execute custom logic at different stages of the stream's lifecycle.
 * - `onStart`: Called once when the stream is initialized.
 * - `onToken`: Called for each tokenized message.
 * - `onCompletion`: Called every time an AIStream completion message is received. This can occur multiple times when using e.g. OpenAI functions
 * - `onFinal`: Called once when the stream is closed with the final completion message.
 *
 * This function is useful when you want to process a stream of messages and perform specific actions during the stream's lifecycle.
 *
 * @param {AIStreamCallbacksAndOptions} [callbacks] - An object containing the callback functions.
 * @return {TransformStream<string, Uint8Array>} A transform stream that encodes input messages as Uint8Array and allows the execution of custom logic through callbacks.
 *
 * @example
 * const callbacks = {
 *   onStart: async () => console.log('Stream started'),
 *   onToken: async (token) => console.log(`Token: ${token}`),
 *   onCompletion: async (completion) => console.log(`Completion: ${completion}`)
 *   onFinal: async () => data.close()
 * };
 * const transformer = createCallbacksTransformer(callbacks);
 */
export function createCallbacksTransformer(
  cb: AIStreamCallbacksAndOptions | undefined,
): TransformStream<string | { isText: false; content: string }, Uint8Array> {
  const textEncoder = new TextEncoder();
  let aggregatedResponse = '';
  const callbacks = cb || {};

  return new TransformStream({
    async start(): Promise<void> {
      if (callbacks.onStart) await callbacks.onStart();
    },

    async transform(message, controller): Promise<void> {
      const content = typeof message === 'string' ? message : message.content;

      controller.enqueue(textEncoder.encode(content));

      aggregatedResponse += content;

      if (callbacks.onToken) await callbacks.onToken(content);
      if (callbacks.onText && typeof message === 'string') {
        await callbacks.onText(message);
      }
    },

    async flush(): Promise<void> {
      if (callbacks.onCompletion) {
        await callbacks.onCompletion(aggregatedResponse);
      }
    },
  });
}

/**
 * Returns a stateful function that, when invoked, trims leading whitespace
 * from the input text. The trimming only occurs on the first invocation, ensuring that
 * subsequent calls do not alter the input text. This is particularly useful in scenarios
 * where a text stream is being processed and only the initial whitespace should be removed.
 *
 * @return {function(string): string} A function that takes a string as input and returns a string
 * with leading whitespace removed if it is the first invocation; otherwise, it returns the input unchanged.
 *
 * @example
 * const trimStart = trimStartOfStreamHelper();
 * const output1 = trimStart("   text"); // "text"
 * const output2 = trimStart("   text"); // "   text"
 *
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
 * Returns a ReadableStream created from the response, parsed and handled with custom logic.
 * The stream goes through two transformation stages, first parsing the events and then
 * invoking the provided callbacks.
 *
 * For 2xx HTTP responses:
 * - The function continues with standard stream processing.
 *
 * For non-2xx HTTP responses:
 * - If the response body is defined, it asynchronously extracts and decodes the response body.
 * - It then creates a custom ReadableStream to propagate a detailed error message.
 *
 * @param {Response} response - The response.
 * @param {AIStreamParser} customParser - The custom parser function.
 * @param {AIStreamCallbacksAndOptions} callbacks - The callbacks.
 * @return {ReadableStream} The AIStream.
 * @throws Will throw an error if the response is not OK.
 */
export function AIStream(
  response: Response,
  customParser?: AIStreamParser,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream<Uint8Array> {
  if (!response.ok) {
    if (response.body) {
      const reader = response.body.getReader();
      return new ReadableStream({
        async start(controller) {
          const { done, value } = await reader.read();
          if (!done) {
            const errorText = new TextDecoder().decode(value);
            controller.error(new Error(`Response error: ${errorText}`));
          }
        },
      });
    } else {
      return new ReadableStream({
        start(controller) {
          controller.error(new Error('Response error: No response body'));
        },
      });
    }
  }

  const responseBodyStream = response.body || createEmptyReadableStream();

  return responseBodyStream
    .pipeThrough(createEventStreamTransformer(customParser))
    .pipeThrough(createCallbacksTransformer(callbacks));
}

// outputs lines like
// 0: chunk
// 0: more chunk
// 1: a fct call
// z: added data from Data

/**
 * Creates an empty ReadableStream that immediately closes upon creation.
 * This function is used as a fallback for creating a ReadableStream when the response body is null or undefined,
 * ensuring that the subsequent pipeline processing doesn't fail due to a lack of a stream.
 *
 * @returns {ReadableStream} An empty and closed ReadableStream instance.
 */
function createEmptyReadableStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}
