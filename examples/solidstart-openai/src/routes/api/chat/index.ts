import { OpenAIStream, StreamingTextResponse } from 'ai'
import OpenAI from 'openai'

import { APIEvent } from 'solid-start/api'

// Create an OpenAI API client
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'] || ''
})

export const POST = async (event: APIEvent) => {
  // Extract the `prompt` from the body of the request
  const { messages } = await event.request.json()

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
  return new StreamingTextResponse(stream)
}
