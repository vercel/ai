import { AIStream, type AIStreamCallbacks } from './ai-stream'

function parseAnthropicStream(): (data: string) => string | void {
  let previous = ''

  return data => {
    const json = JSON.parse(data as string) as {
      completion: string
      stop: string | null
      stop_reason: string | null
      truncated: boolean
      log_id: string
      model: string
      exception: string | null
    }

    // Anthropic's `completion` field is cumulative unlike OpenAI's
    // deltas. In order to compute the delta, we must slice out the text
    // we previously received.
    const text = json.completion
    const delta = text.slice(previous.length)
    previous = text

    return delta
  }
}

export function AnthropicStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseAnthropicStream(), cb)
}
