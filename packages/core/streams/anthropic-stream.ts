import type { AIStreamOptions } from './types'
import { AIStream } from './ai-stream'
import { anthropicParsers } from './parsers'

export function AnthropicStream(res: Response, options: AIStreamOptions = {}) {
  return AIStream(res, { parsers: anthropicParsers, ...options })
}
