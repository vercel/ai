// ./app/api/chat/route.ts
import Replicate from 'replicate'
import { type Message, ReplicateStream, StreamingTextResponse } from 'ai'

// Create a Replicate API client (that's edge friendly!)
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY || ''
})

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge'

export async function POST(req: Request) {
  // Extract the `prompt` from the body of the request
  const { messages } = await req.json()

  // Ask Replicate for a streaming chat completion given the prompt
  const prediction = await replicate.predictions.create({
    // Llama-70b-chat
    version: '2c1608e18606fad2812020dc541930f2d0495ce32eee50074220b87300bc16e1',
    input: { prompt: messages.map((m: Message) => m.content).join('\n') },
    stream: true
  })

  // Convert the response into a friendly text-stream
  const stream = await ReplicateStream(prediction)
  // Respond with the stream
  return new StreamingTextResponse(stream)
}
