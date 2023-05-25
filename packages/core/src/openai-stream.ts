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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
    const json = JSON.parse(data)
    // this can be used for either chat or completion models
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const text = json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? ''

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (counter < 2 && (text.match(/\n/) || []).length) {
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

export function OpenAIStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseOpenAIStream, cb)
}

OpenAIStream.$$typeof = Symbol.for('AIStream.OpenAIStream')
