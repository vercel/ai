import {
  createParser,
  type EventSourceParser,
  type ParsedEvent,
  type ReconnectInterval
} from 'eventsource-parser'
import { OpenAIStreamCallbacks } from './openai-stream'

export interface FunctionCallPayload {
  name: string
  arguments: Record<string, unknown>
}

/**
 * Configuration options and helper callback methods for AIStream stream lifecycle events.
 * @interface
 */
export interface AIStreamCallbacksAndOptions {
  /** `onStart`: Called once when the stream is initialized. */
  onStart?: () => Promise<void> | void
  /** `onCompletion`: Called for each tokenized message. */
  onCompletion?: (completion: string) => Promise<void> | void
  /** `onFinal`: Called once when the stream is closed with the final completion message. */
  onFinal?: (completion: string) => Promise<void> | void
  /** `onToken`: Called for each tokenized message. */
  onToken?: (token: string) => Promise<void> | void
  /**
   * A flag for enabling the experimental_StreamData class and the new protocol.
   * @see https://github.com/vercel-labs/ai/pull/425
   *
   * When StreamData is rolled out, this will be removed and the new protocol will be used by default.
   */
  experimental_streamData?: boolean
}

// new TokenData()
// data: TokenData,
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
  customParser?: AIStreamParser
): TransformStream<Uint8Array, string> {
  const textDecoder = new TextDecoder()
  let eventSourceParser: EventSourceParser

  return new TransformStream({
    async start(controller): Promise<void> {
      eventSourceParser = createParser(
        (event: ParsedEvent | ReconnectInterval) => {
          if (
            ('data' in event &&
              event.type === 'event' &&
              event.data === '[DONE]') ||
            // Replicate doesn't send [DONE] but does send a 'done' event
            // @see https://replicate.com/docs/streaming
            (event as any).event === 'done'
          ) {
            controller.terminate()
            return
          }

          if ('data' in event) {
            const parsedMessage = customParser
              ? customParser(event.data)
              : event.data
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
  cb: AIStreamCallbacksAndOptions | OpenAIStreamCallbacks | undefined
): TransformStream<string, Uint8Array> {
  const textEncoder = new TextEncoder()
  let aggregatedResponse = ''
  const callbacks = cb || {}

  return new TransformStream({
    async start(): Promise<void> {
      if (callbacks.onStart) await callbacks.onStart()
    },

    async transform(message, controller): Promise<void> {
      controller.enqueue(textEncoder.encode(message))

      if (callbacks.onToken) await callbacks.onToken(message)
      if (callbacks.onCompletion) aggregatedResponse += message
    },

    async flush(): Promise<void> {
      const isOpenAICallbacks = isOfTypeOpenAIStreamCallbacks(callbacks)
      // If it's OpenAICallbacks, it has an experimental_onFunctionCall which means that the createFunctionCallTransformer
      // will handle calling onComplete.
      if (callbacks.onCompletion) {
        await callbacks.onCompletion(aggregatedResponse)
      }

      if (callbacks.onFinal && !isOpenAICallbacks) {
        await callbacks.onFinal(aggregatedResponse)
      }
    }
  })
}

function isOfTypeOpenAIStreamCallbacks(
  callbacks: AIStreamCallbacksAndOptions | OpenAIStreamCallbacks
): callbacks is OpenAIStreamCallbacks {
  return 'experimental_onFunctionCall' in callbacks
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
  callbacks?: AIStreamCallbacksAndOptions
): ReadableStream<Uint8Array> {
  if (!response.ok) {
    if (response.body) {
      const reader = response.body.getReader()
      return new ReadableStream({
        async start(controller) {
          const { done, value } = await reader.read()
          if (!done) {
            const errorText = new TextDecoder().decode(value)
            controller.error(new Error(`Response error: ${errorText}`))
          }
        }
      })
    } else {
      return new ReadableStream({
        start(controller) {
          controller.error(new Error('Response error: No response body'))
        }
      })
    }
  }

  const responseBodyStream = response.body || createEmptyReadableStream()

  return responseBodyStream
    .pipeThrough(createEventStreamTransformer(customParser))
    .pipeThrough(createCallbacksTransformer(callbacks))
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
      controller.close()
    }
  })
}

/**
 * Implements ReadableStream.from(asyncIterable), which isn't documented in MDN and isn't implemented in node.
 * https://github.com/whatwg/streams/commit/8d7a0bf26eb2cc23e884ddbaac7c1da4b91cf2bc
 */
export function readableFromAsyncIterable<T>(iterable: AsyncIterable<T>) {
  let it = iterable[Symbol.asyncIterator]()
  return new ReadableStream<T>({
    async pull(controller) {
      const { done, value } = await it.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },

    async cancel(reason) {
      await it.return?.(reason)
    }
  })
}
