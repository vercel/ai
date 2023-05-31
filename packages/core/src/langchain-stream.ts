import { AIStreamCallbacks } from './ai-stream'

export function createLangChainStreamingAdapter(callbacks?: AIStreamCallbacks) {
  const stream = new TransformStream()
  const encoder = new TextEncoder()
  const writer = stream.writable.getWriter()
  const decoder = new TextDecoder()
  let fullResponse = ''
  const forkedStream = new TransformStream({
    start: async (): Promise<void> => {
      if (callbacks?.onStart) {
        await callbacks.onStart()
      }
    },
    transform: async (chunk, controller): Promise<void> => {
      controller.enqueue(chunk)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const item = decoder.decode(chunk)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const value = JSON.parse(item.split('\n')[0])
      if (callbacks?.onToken) {
        await callbacks.onToken(value as string)
      }
      fullResponse += value
    },
    flush: async (controller): Promise<void> => {
      if (callbacks?.onCompletion) {
        await callbacks.onCompletion(fullResponse)
      }
      controller.terminate()
    }
  })
  return {
    stream: stream.readable.pipeThrough(forkedStream),
    handlers: {
      handleLLMNewToken: async (token: string) => {
        await writer.ready
        await writer.write(encoder.encode(`${JSON.stringify(token)}\n`))
      },
      handleLLMEnd: async () => {
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
