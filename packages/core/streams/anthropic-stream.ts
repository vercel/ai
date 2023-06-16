import type { AIStreamOptions } from './types'
import { AIStream } from './ai-stream'

export function AnthropicStream(res: Response, options: AIStreamOptions = {}) {
  return AIStream(res, { platform: 'anthropic', ...options })
}
