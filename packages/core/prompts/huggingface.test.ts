import {
  experimental_buildOpenAssistantPrompt,
  experimental_buildStarChatBetaPrompt,
  experimental_buildLlama2Prompt
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
    const prompt = experimental_buildStarChatBetaPrompt(messages)
    expect(prompt).toEqual(expectedPrompt)
  })

  it('should throw an error if a function message is included', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'someFunction()', role: 'function' }
    ]
    expect(() => experimental_buildStarChatBetaPrompt(messages)).toThrow()
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
    const prompt = experimental_buildOpenAssistantPrompt(messages)
    expect(prompt).toEqual(expectedPrompt)
  })

  it('should throw an error if a function message is included', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'someFunction()', role: 'function' }
    ]
    expect(() => experimental_buildOpenAssistantPrompt(messages)).toThrow()
  })
})

describe('buildLlamaPrompt', () => {
  it('should return a string with user instruction', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'Hello, how are you?', role: 'user' }
    ]

    const expectedPrompt = '<s>[INST] Hello, how are you? [/INST]'
    const prompt = experimental_buildLlama2Prompt(messages)
    expect(prompt).toEqual(expectedPrompt)
  })

  it('should return a string with system, user and assistant messages', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      {
        content: 'You are helpful assistant, but you are drunk, hick',
        role: 'system'
      },
      { content: 'Hi there!', role: 'user' },
      { content: 'Sup, partner!', role: 'assistant' },
      { content: 'What are you doing?', role: 'user' }
    ]

    const expectedPrompt =
      '<s>[INST] <<SYS>>\nYou are helpful assistant, but you are drunk, hick\n<</SYS>>\n\nHi there! [/INST] Sup, partner!</s><s>[INST] What are you doing? [/INST]'
    const prompt = experimental_buildLlama2Prompt(messages)
    expect(prompt).toEqual(expectedPrompt)
  })

  it('should throw an error if a function message is included', () => {
    const messages: Pick<Message, 'content' | 'role'>[] = [
      { content: 'someFunction()', role: 'function' }
    ]
    expect(() => experimental_buildLlama2Prompt(messages)).toThrow()
  })
})
