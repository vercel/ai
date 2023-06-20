import { createCallbacksTransform } from './transforms'
import { AIStreamCallbacks } from './types'

export function LangChainStream(callbacks?: AIStreamCallbacks) {
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  return {
    stream: stream.readable.pipeThrough(createCallbacksTransform(callbacks)),
    handlers: {
      handleLLMNewToken: async (token: string) => {
        await writer.ready
        await writer.write(token)
      },
      handleChainEnd: async () => {
        await writer.ready
        await writer.close()
      },
      handleLLMError: async (e: any) => {
        await writer.ready
        await writer.abort(e)
      }
    }
  }
}
