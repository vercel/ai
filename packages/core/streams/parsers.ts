import { AIStreamMode, AIStreamParser } from './types'
import { trimStartOfStreamHelper } from './utils'

export type AIStreamParsers = (mode: AIStreamMode) => AIStreamParser | undefined

export const openaiParsers: AIStreamParsers = mode => {
  const trimStartOfStream = trimStartOfStreamHelper()

  switch (mode) {
    case 'raw':
      return

    case 'text':
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
}

export const anthropicParsers: AIStreamParsers = mode => {
  switch (mode) {
    case 'raw':
      return

    case 'text':
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
  }
}
