import {
  createParser,
  type EventSourceParser,
  type ParsedEvent,
  type ReconnectInterval
} from 'eventsource-parser'

export interface AIStreamCallbacks {
  onStart?: () => Promise<void>
  onCompletion?: (completion: string) => Promise<void>
  onToken?: (token: string) => Promise<void>
}

export interface AIStreamParserOptions {
  data: any
  counter: number
}

export interface AIStreamParser {
  (opts: AIStreamParserOptions): string | void
}

export function createEventStreamTransformer(customParser: AIStreamParser) {
  const decoder = new TextDecoder()
  let counter = 0
  let parser: EventSourceParser

  return new TransformStream<Uint8Array, string>({
    async start(controller): Promise<void> {
      function onParse(event: ParsedEvent | ReconnectInterval): void {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.terminate()
            return
          }

          const message = customParser({ data, counter })
          counter++

          if (message) controller.enqueue(message)
        }
      }

      parser = createParser(onParse)
    },

    transform(chunk) {
      parser.feed(decoder.decode(chunk))
    }
  })
}

/**
 * This stream forks input stream, allowing us to use the result as a
 * bytestream of the messages and pass the messages to our callback interface.
 */
export function createCallbacksTransformer(
  callbacks: AIStreamCallbacks | undefined
) {
  const encoder = new TextEncoder()
  let fullResponse = ''

  const { onStart, onToken, onCompletion } = callbacks || {}

  return new TransformStream<string, Uint8Array>({
    async start(): Promise<void> {
      if (onStart) await onStart()
    },

    async transform(message, controller): Promise<void> {
      controller.enqueue(encoder.encode(message))

      if (onToken) await onToken(message)
      if (onCompletion) fullResponse += message
    },

    async flush(): Promise<void> {
      await onCompletion?.(fullResponse)
    }
  })
}

export function AIStream(
  res: Response,
  customParser: AIStreamParser,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  const stream =
    res.body ||
    new ReadableStream({
      start(controller) {
        controller.close()
      }
    })

  return stream
    .pipeThrough(createEventStreamTransformer(customParser))
    .pipeThrough(createCallbacksTransformer(callbacks))
}
