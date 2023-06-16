import type { AIStreamOptions } from './types'
import { AIStream } from './ai-stream'

export function OpenAIStream(res: Response, options: AIStreamOptions = {}) {
  return AIStream(res, { platform: 'openai', ...options })
}
