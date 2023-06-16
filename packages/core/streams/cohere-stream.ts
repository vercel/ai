import {
  type AIStreamCallbacks,
  createCallbacksTransformer,
  trimStartOfStreamHelper
} from './ai-stream'

function createParser(res: AsyncGenerator<any>) {
  const trimStartOfStream = trimStartOfStreamHelper()
  return new ReadableStream<string>({
    async pull(controller): Promise<void> {
      const { value, done } = await res.next()
      if (done) {
        controller.close()
        return
      }

      const { text, is_finished } = JSON.parse(value)

      if (is_finished === true) {
        controller.close()
      } else {
        controller.enqueue(text)
      }
    }
  })
}

export function CohereStream(
  res: AsyncGenerator<any>,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  return createParser(res).pipeThrough(createCallbacksTransformer(callbacks))
}
