import OpenAI from 'openai'
import { OpenAIStream } from 'ai'
import { CreateChatCompletionRequestMessage } from 'openai/resources/chat'

export default defineLazyEventHandler(async () => {
  const apiKey = useRuntimeConfig().openaiApiKey
  if (!apiKey) throw new Error('Missing OpenAI API key')
  const openai = new OpenAI({
    apiKey: apiKey
  })

  return defineEventHandler(async event => {
    // Extract the `prompt` from the body of the request
    const { messages } = (await readBody(event)) as {
      messages: CreateChatCompletionRequestMessage[]
    }

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: messages.map(message => ({
        content: message.content,
        role: message.role
      }))
    })

    // Convert the response into a friendly text-stream
    return OpenAIStream(response)
  })
})
