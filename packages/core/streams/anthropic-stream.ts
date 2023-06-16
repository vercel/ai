import { AIStream } from './ai-stream'
import { TEXT_PARSERS } from './parsers'
import { AIStreamCallbacks } from './types'

export function AnthropicStream(
  res: Response,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, {
    parser: TEXT_PARSERS.anthropic(),
    ...callbacks
  })
}
