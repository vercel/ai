// ./api/chat.ts
import { Configuration, OpenAIApi } from 'openai-edge'
import { OpenAIStream, streamToResponse } from 'ai'

// Create an OpenAI API client (that's edge friendly!)
const config = new Configuration({
  // eslint-disable-next-line react-hooks/rules-of-hooks
  apiKey: useRuntimeConfig().openaiApiKey
})
const openai = new OpenAIApi(config)

export default defineEventHandler(async (event: any) => {
  // Extract the `prompt` from the body of the request
  const { messages } = await readBody(event)

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.createChatCompletion({
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
