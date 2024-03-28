import {
  AIStream,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  createStreamDataTransformer
} from './ai-stream.ts'
import { createStreamDataTransformer } from './stream-data';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

interface ChatRequestParams {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  format?: string
  options?: Record<string, unknown>
  template?: string
}

interface ChatResponse {
  model: string
  created_at: string
  message?: ChatMessage
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

interface ChatCompletionChunk {
  model: string
  created_at: string
  message: ChatMessage
  done: boolean
}

export interface CompletionResponse {
  model: string
  created_at: string
  response: string
  done: boolean
  context?: number[]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface CompletionChunk {
  model: string
  created_at: string
  response: string
  done: boolean
}

type OllamaStreamData = ChatResponse | ChatCompletionChunk | CompletionResponse | CompletionChunk

function parseOllamaStream (): (data: string) => OllamaStreamData {
  return data => {
    try {
      return JSON.parse(data)
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('Received non-JSON data:', data)
      } else {
        throw error
      }
    }
  }
}

async function * streamable<T> (stream: AsyncIterable<T>) {
  for await (const chunk of stream) {
    yield chunk
  }
}

// A modified version of the streamable function specifically for chat messages
async function * chatStreamable (
  stream: AsyncIterable<ChatResponse>,
) {
  for await (const response of stream) {
    if (response.message) {
      yield response.message
    }
    if (response.done) {
      // Additional final response data can be handled here if necessary
      return
    }
  }
}

export function OllamaStream (
  res: Response | AsyncIterable<OllamaStreamData>,
  cb?: AIStreamCallbacksAndOptions
): ReadableStream<string> {
  if ('body' in res) {
    const asyncIterable = chunksToAsyncIterator(res.body, parseOllamaStream())
    return readableFromAsyncIterable(asyncIterable)
      .pipeThrough(createCallbacksTransformer(cb))
      .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData))
  } else if (Symbol.asyncIterator in res) {
    return readableFromAsyncIterable(streamable(res))
      .pipeThrough(createCallbacksTransformer(cb))
      .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData))
  } else {
    throw new Error('The provided resource is neither a Response nor an AsyncIterable.')
  }
}

// Helper function to convert a ReadableStream (from the Fetch Response) to an AsyncIterable
async function * chunksToAsyncIterator (
  stream: ReadableStream<Uint8Array>,
  parseFn: (data: string) => OllamaStreamData
): AsyncIterable<OllamaStreamData> {
  let buffer = ''
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const textDecoder = new TextDecoder()
      buffer += textDecoder.decode(value)
      let boundary = buffer.indexOf('\n')
      while (boundary !== -1) {
        const dataToParse = buffer.substring(0, boundary)
        buffer = buffer.substring(boundary + 1)
        const parsedData = parseFn(dataToParse)
        if (parsedData?.message) {
          yield parsedData.message.content
        } else if (parsedData?.response) {
          yield parsedData.response
        }
        boundary = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}
