import { type AIStreamCallbacks, createCallbacksTransformer } from './ai-stream'

const decoder = new TextDecoder()

function createParser(reader: ReadableStreamDefaultReader<Uint8Array>) {
  return new ReadableStream<string>({
    async pull(controller): Promise<void> {
      const { value, done } = await reader.read()
      if (done) {
        controller.close()
        return
      }

      const { text, is_finished } = JSON.parse(decoder.decode(value))

      if (is_finished === true) {
        controller.close()
      } else {
        controller.enqueue(text)
      }
    }
  })
}

export function CohereStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  return createParser(reader).pipeThrough(createCallbacksTransformer(callbacks))
}
