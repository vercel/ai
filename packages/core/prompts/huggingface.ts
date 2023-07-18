import { Message } from '../shared/types'

/**
 * A prompt constructor for the HuggingFace StarChat Beta model.
 * Does not support `function` messages.
 * @see https://huggingface.co/HuggingFaceH4/starchat-beta
 */
export function experimental_buildStarChatBetaPrompt(
  messages: Pick<Message, 'content' | 'role'>[]
) {
  return (
    messages
      .map(({ content, role }) => {
        if (role === 'user') {
          return `<|user|>\n${content}<|end|>\n`
        } else if (role === 'assistant') {
          return `<|assistant|>\n${content}<|end|>\n`
        } else if (role === 'system') {
          return `<|system|>\n${content}<|end|>\n`
        } else if (role === 'function') {
          throw new Error('StarChat Beta does not support function calls.')
        }
      })
      .join('') + '<|assistant|>'
  )
}

/**
 * A prompt constructor for HuggingFace OpenAssistant models.
 * Does not support `function` or `system` messages.
 * @see https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5
 */
export function experimental_buildOpenAssistantPrompt(
  messages: Pick<Message, 'content' | 'role'>[]
) {
  return (
    messages
      .map(({ content, role }) => {
        if (role === 'user') {
          return `<|prompter|>${content}<|endoftext|>`
        } else if (role === 'function') {
          throw new Error('OpenAssistant does not support function calls.')
        } else if (role === 'system') {
          throw new Error('OpenAssistant does not support system messages.')
        } else {
          return `<|assistant|>${content}<|endoftext|>`
        }
      })
      .join('') + '<|assistant|>'
  )
}
