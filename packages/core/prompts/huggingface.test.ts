import {
  buildOpenAssistantPrompt,
  buildStarChatBetaPrompt
} from './huggingface'
import type { Message } from '../shared/types'

describe('buildStarChatBetaPrompt', () => {
  it('should return a string with user, assistant, and system messages', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'You are a chat bot.', role: 'system' },
      { content: 'Hello!', role: 'user' },
      { content: 'Hi there!', role: 'assistant' }
    ]

    const expectedPrompt = `<|system|>\nYou are a chat bot.<|end|>\n<|user|>\nHello!<|end|>\n<|assistant|>\nHi there!<|end|>\n<|assistant|>`
    const prompt = buildStarChatBetaPrompt(messages)
    expect(prompt).toEqual(expectedPrompt)
  })

  it('should throw an error if a function message is included', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'someFunction()', role: 'function' }
    ]
    expect(() => buildStarChatBetaPrompt(messages)).toThrow()
  })
})

describe('buildOpenAssistantPrompt', () => {
  it('should return a string with user and assistant messages', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'Hello!', role: 'user' },
      { content: 'Hi there!', role: 'assistant' }
    ]

    const expectedPrompt =
      '<|prompter|>Hello!<|endoftext|><|assistant|>Hi there!<|endoftext|><|assistant|>'
    const prompt = buildOpenAssistantPrompt(messages)
    expect(prompt).toEqual(expectedPrompt)
  })

  it('should throw an error if a function message is included', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'someFunction()', role: 'function' }
    ]
    expect(() => buildOpenAssistantPrompt(messages)).toThrow()
  })
})
