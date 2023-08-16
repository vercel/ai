import { JSONValue } from '../shared/types'
import { getStreamString } from '../shared/utils'

/**
 * A stream wrapper to send custom JSON-encoded data back to the client.
 */
export class experimental_StreamData {
  private encoder = new TextEncoder()

  private controller: TransformStreamDefaultController<Uint8Array> | null = null
  public stream: TransformStream<Uint8Array, Uint8Array>

  // closing the stream is synchronous, but we want to return a promise
  // in case we're doing async work
  private isClosedPromise: Promise<void> | null = null
  private isClosedPromiseResolver: undefined | (() => void) = undefined
  private isClosed: boolean = false

  // array to store appended data
  private data: JSONValue[] = []
  constructor() {
    this.isClosedPromise = new Promise(resolve => {
      this.isClosedPromiseResolver = resolve
    })

    const self = this
    this.stream = new TransformStream({
      start: async controller => {
        self.controller = controller
      },
      transform: async (chunk, controller) => {
        controller.enqueue(chunk)

        // add buffered data to the stream
        if (self.data.length > 0) {
          const encodedData = self.encoder.encode(
            getStreamString('data', JSON.stringify(self.data))
          )
          self.data = []
          controller.enqueue(encodedData)
        }
      },
      async flush(controller) {
        // Show a warning during dev if the data stream is hanging after 3 seconds.
        const warningTimeout =
          process.env.NODE_ENV === 'development'
            ? setTimeout(() => {
                console.warn(
                  'The data stream is hanging. Did you forget to close it with `data.close()`?'
                )
              }, 3000)
            : null

        await self.isClosedPromise

        if (warningTimeout !== null) {
          clearTimeout(warningTimeout)
        }

        if (self.data.length) {
          const encodedData = self.encoder.encode(
            getStreamString('data', JSON.stringify(self.data))
          )
          controller.enqueue(encodedData)
        }
      }
    })
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      throw new Error('Data Stream has already been closed.')
    }

    if (!this.controller) {
      throw new Error('Stream controller is not initialized.')
    }

    this.isClosedPromiseResolver?.()
    this.isClosed = true
  }

  append(value: JSONValue): void {
    if (this.isClosed) {
      throw new Error('Data Stream has already been closed.')
    }

    this.data.push(value)
  }
}

/**
 * A TransformStream for LLMs that do not have their own transform stream handlers managing encoding (e.g. OpenAIStream has one for function call handling).
 * This assumes every chunk is a 'text' chunk.
 */
export function createStreamDataTransformer(
  experimental_streamData: boolean | undefined
) {
  if (!experimental_streamData) {
    return new TransformStream({
      transform: async (chunk, controller) => {
        controller.enqueue(chunk)
      }
    })
  }
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  return new TransformStream({
    transform: async (chunk, controller) => {
      const message = decoder.decode(chunk)
      controller.enqueue(encoder.encode(getStreamString('text', message)))
    }
  })
}
