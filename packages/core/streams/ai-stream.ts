import {
  createParser,
  type EventSourceParser,
  type ParsedEvent,
  type ReconnectInterval
} from 'eventsource-parser'

/**
 * Helper callback methods for AIStream stream lifecycle events
 * @interface
 */
export interface AIStreamCallbacks {
  onStart?: () => Promise<void>
  onCompletion?: (completion: string) => Promise<void>
  onToken?: (token: string) => Promise<void>
}

/**
 * Custom parser for AIStream data.
 * @interface
 */
export interface AIStreamParser {
  (data: string): string | void
}

/**
 * Creates a TransformStream that parses events from an EventSource stream using a custom parser.
 * @param {AIStreamParser} customParser - Function to handle event data.
 * @returns {TransformStream<Uint8Array, string>} TransformStream parsing events.
 */
export function createEventStreamTransformer(
  customParser: AIStreamParser
): TransformStream<Uint8Array, string> {
  const textDecoder = new TextDecoder()
  let eventSourceParser: EventSourceParser

  return new TransformStream({
    async start(controller): Promise<void> {
      eventSourceParser = createParser(
        (event: ParsedEvent | ReconnectInterval) => {
          if (
            'data' in event &&
            event.type === 'event' &&
            event.data === '[DONE]'
          ) {
            controller.terminate()
            return
          }

          if ('data' in event) {
            const parsedMessage = customParser(event.data)
            if (parsedMessage) controller.enqueue(parsedMessage)
          }
        }
      )
    },

    transform(chunk) {
      eventSourceParser.feed(textDecoder.decode(chunk))
    }
  })
}

/**
 * Creates a transform stream that encodes input messages and invokes optional callback functions.
 * The transform stream uses the provided callbacks to execute custom logic at different stages of the stream's lifecycle.
 * - `onStart`: Called once when the stream is initialized.
 * - `onToken`: Called for each tokenized message.
 * - `onCompletion`: Called once when the stream is flushed, with the aggregated messages.
 *
 * This function is useful when you want to process a stream of messages and perform specific actions during the stream's lifecycle.
 *
 * @param {AIStreamCallbacks} [callbacks] - An object containing the callback functions.
 * @return {TransformStream<string, Uint8Array>} A transform stream that encodes input messages as Uint8Array and allows the execution of custom logic through callbacks.
 *
 * @example
 * const callbacks = {
 *   onStart: async () => console.log('Stream started'),
 *   onToken: async (token) => console.log(`Token: ${token}`),
 *   onCompletion: async (completion) => console.log(`Completion: ${completion}`)
 * };
 * const transformer = createCallbacksTransformer(callbacks);
 */
export function createCallbacksTransformer(
  callbacks: AIStreamCallbacks | undefined
): TransformStream<string, Uint8Array> {
  const textEncoder = new TextEncoder()
  let aggregatedResponse = ''
  const { onStart, onToken, onCompletion } = callbacks || {}

  return new TransformStream({
    async start(): Promise<void> {
      if (onStart) await onStart()
    },

    async transform(message, controller): Promise<void> {
      controller.enqueue(textEncoder.encode(message))

      if (onToken) await onToken(message)
      if (onCompletion) aggregatedResponse += message
    },

    async flush(): Promise<void> {
      if (onCompletion) await onCompletion(aggregatedResponse)
    }
  })
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
  let isStreamStart = true

  return (text: string): string => {
    if (isStreamStart) {
      text = text.trimStart()
      if (text) isStreamStart = false
    }
    return text
  }
}

/**
 * Returns a ReadableStream created from the response, parsed and handled with custom logic.
 * The stream goes through two transformation stages, first parsing the events and then
 * invoking the provided callbacks.
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
    throw new Error(
      `Failed to convert the response to stream. Received status code: ${response.status}.`
    )
  }

  const responseBodyStream = response.body || createEmptyReadableStream()

  return responseBodyStream
    .pipeThrough(createEventStreamTransformer(customParser))
    .pipeThrough(createCallbacksTransformer(callbacks))
}

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
      controller.close()
    }
  })
}
