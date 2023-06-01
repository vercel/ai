import {
  AIStream,
  type AIStreamCallbacks,
  type AIStreamParserOptions
} from './ai-stream'

function parseOpenAIStream({
  data,
  controller,
  counter,
  encoder
}: AIStreamParserOptions): void {
  try {
    const json = JSON.parse(data)
    // this can be used for either chat or completion models

    const text = json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? ''

    if (counter < 2 && (text.match(/\n/) || []).length) {
      return
    }

    const queue = encoder.encode(`${JSON.stringify(text)}\n`)
    controller.enqueue(queue)

    counter++
  } catch (e) {
    controller.error(e)
  }
}

export function OpenAIStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseOpenAIStream, cb)
}
