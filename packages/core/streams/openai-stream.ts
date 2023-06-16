import type { AIStreamOptions, AIStreamParser } from './types'
import { TEXT_PARSERS } from './parsers'
import { AIStream } from './ai-stream'

export function OpenAIStream(
  res: Response,
  options: AIStreamOptions = {}
): ReadableStream {
  const { mode = 'text', ...callbacks } = options
  let parser: AIStreamParser | undefined = undefined

  switch (mode) {
    case 'raw':
      /** Return raw JSON, can leave as ReadableStream<Uint8Array>. */
      break

    case 'text':
      parser = TEXT_PARSERS.openai()
      break
  }

  return AIStream(res, { parser, ...callbacks })
}
