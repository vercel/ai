import {
  AIStream,
  type AIStreamCallbacks,
  type AIStreamParserOptions
} from './ai-stream'

function parseAnthropicStream({
  data,
  controller,
  counter,
  encoder
}: AIStreamParserOptions): void {
  try {
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
    if (counter < 2 && (/\n/.exec(text) || []).length) {
      return
    }

    const queue = encoder.encode(`${JSON.stringify(text)}\n`)
    controller.enqueue(queue)

    // eslint-disable-next-line no-param-reassign
    counter++
  } catch (e) {
    controller.error(e)
  }
}

export function AnthropicStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseAnthropicStream, cb)
}

AnthropicStream.$$typeof = Symbol.for('AIStream.AnthropicStream')
