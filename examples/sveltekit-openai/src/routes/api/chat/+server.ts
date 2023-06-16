import { Configuration, OpenAIApi } from 'openai-edge'
import { OpenAIStream, StreamingTextResponse } from 'ai'

import { env } from '$env/dynamic/private'
// You may want to replace the above with a static private env variable
// for dead-code elimination and build-time type-checking:
// import { OPENAI_API_KEY } from '$env/static/private'

import type { RequestHandler } from './$types'

// Create an OpenAI API client
const config = new Configuration({
  apiKey: env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

export const POST = (async ({ request }) => {
  // Extract the `prompt` from the body of the request
  const { messages } = await request.json()

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
  return new StreamingTextResponse(stream)
}) satisfies RequestHandler
