import {
  AIStream,
  type AIStreamCallbacks,
  type AIStreamParserOptions
} from './ai-stream'

function parseOpenAIStream({
  data,
  counter
}: AIStreamParserOptions): string | void {
  // TODO: Needs a type
  const json = JSON.parse(data)

  // this can be used for either chat or completion models
  const text = json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? ''

  // TODO: I don't understand the `counter && has newline`. Should this be `counter < 2 || !has newline?`?
  if (counter < 2 && text.includes('\n')) {
    return
  }

  return text
}

export function OpenAIStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseOpenAIStream, cb)
}
