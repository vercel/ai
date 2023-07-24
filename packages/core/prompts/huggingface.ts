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

/**
 * A prompt constructor for HuggingFace LLama 2 chat models.
 * Does not support `function` messages.
 * @see https://huggingface.co/meta-llama/Llama-2-70b-chat-hf and https://huggingface.co/blog/llama2#how-to-prompt-llama-2
 */
export function experimental_buildLlama2Prompt(
  messages: Pick<Message, 'content' | 'role'>[]
) {
  const startPrompt = `<s>[INST] `
  const endPrompt = ` [/INST]`
  const conversation = messages.map(({ content, role }, index) => {
    if (role === 'user') {
      return content.trim()
    } else if (role === 'assistant') {
      return ` [/INST] ${content}</s><s>[INST] `
    } else if (role === 'function') {
      throw new Error('Llama 2 does not support function calls.')
    } else if (role === 'system' && index === 0) {
      return `<<SYS>>\n${content}\n<</SYS>>\n\n`
    } else {
      throw new Error(`Invalid message role: ${role}`)
    }
  })

  return startPrompt + conversation.join('') + endPrompt
}
