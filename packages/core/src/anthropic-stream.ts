import {
  AIStream,
  type AIStreamCallbacks,
  type AIStreamParserOptions
} from './ai-stream'

function parseAnthropicStream({
  data,
  counter
}: AIStreamParserOptions): string | void {
  const json = JSON.parse(data as string) as {
    completion: string
    stop: string | null
    stop_reason: string | null
    truncated: boolean
    log_id: string
    model: string
    exception: string | null
  }

  const text = json.completion

  // TODO: I don't understand the `counter && has newline`. Should this be `counter < 2 || !has newline?`?
  if (counter < 2 && text.includes('\n')) {
    return
  }

  return text
}

export function AnthropicStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseAnthropicStream, cb)
}
