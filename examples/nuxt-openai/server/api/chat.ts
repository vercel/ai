// ./api/chat.ts
import OpenAI from 'openai'
import { OpenAIStream } from 'ai'

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  // eslint-disable-next-line react-hooks/rules-of-hooks
  apiKey: useRuntimeConfig().openaiApiKey
})

export default defineEventHandler(async (event: any) => {
  // Extract the `prompt` from the body of the request
  const { messages } = await readBody(event)

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    stream: true,
    messages: messages.map((message: any) => ({
      content: message.content,
      role: message.role
    }))
  })

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response)
  // Respond with the stream
  const reader = stream.getReader()
  return new Promise((resolve, reject) => {
    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          event.node.res.end()
          return
        }
        event.node.res.write(value)
        read()
      })
    }
    read()
  })
})
