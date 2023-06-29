import { type AIStreamCallbacks, createCallbacksTransformer } from './ai-stream'

const decoder = new TextDecoder()

function createParser(res: Response) {
  const reader = res.body?.getReader()
  return new ReadableStream<string>({
    async pull(controller): Promise<void> {
      if (!reader) {
        controller.close()
        return
      }

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
  reader: Response,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  return createParser(reader).pipeThrough(createCallbacksTransformer(callbacks))
}
