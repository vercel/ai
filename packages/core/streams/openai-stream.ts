import type { AIStreamOptions } from './types'
import { AIStream } from './ai-stream'
import { openaiParsers } from './parsers'

export function OpenAIStream(res: Response, options: AIStreamOptions = {}) {
  return AIStream(res, { parsers: openaiParsers, ...options })
}
