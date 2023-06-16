import {
  AIStream,
  trimStartOfStreamHelper,
} from './ai-stream'
import { AIStreamCallbacks } from "./types"

function parseOpenAIStream(): (data: string) => string | void {
  const trimStartOfStream = trimStartOfStreamHelper()
  return data => {
    // TODO: Needs a type
    const json = JSON.parse(data)

    // this can be used for either chat or completion models
    const text = trimStartOfStream(
      json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? ''
    )

    return text
  }
}

export function OpenAIStream(
  res: Response,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseOpenAIStream(), callbacks)
}
