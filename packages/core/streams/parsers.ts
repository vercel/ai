import { AIStreamMode, AIStreamParser } from './types'
import { trimStartOfStreamHelper } from './utils'

export type AIStreamParsers = () => {
  [mode in AIStreamMode]?: AIStreamParser
}

const parseJson = (text: (data: string) => string) => {
  let buffer = "";
  
  return (data: string) => {
    try {
      const parsed = text(data)
      buffer += parsed
  
      /**
       * If the buffer contains a valid JSON object, reset the buffer, then
       * return it.
       */
      const trimmed = buffer.trim()
      JSON.parse(trimmed)
      
      buffer = ""
      return trimmed
    } catch (e) {
      /** Wait for complete JSON. */
    }
  }
};

export const openaiParsers: AIStreamParsers = () => {
  const trimStartOfStream = trimStartOfStreamHelper()

  const text = (data: string) => {
    // TODO: Needs a type
    const json = JSON.parse(data)

    // this can be used for either chat or completion models
    const text = trimStartOfStream(
      json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? ''
    )

    return text
  }

  return {
    raw: null,
    text,
    json: parseJson(text),
  }
}

export const anthropicParsers: AIStreamParsers = () => {
  let previous = ''

  const text = (data: string) => {
    const json = JSON.parse(data as string) as {
      completion: string
      stop: string | null
      stop_reason: string | null
      truncated: boolean
      log_id: string
      model: string
      exception: string | null
    }

    /**
     * Anthropic's `completion` field is cumulative unlike OpenAI's deltas. In
     * order to compute the delta, we must slice out the text we previously
     * received.
     */
    const text = json.completion
    const delta = text.slice(previous.length)
    previous = text

    return delta
  }

  return {
    raw: null,
    text,
    json: parseJson(text),
  }
}
