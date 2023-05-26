// app/api/generate/route.ts
import { Configuration, OpenAIApi } from 'openai-edge'
import { OpenAIStream, StreamingTextResponse } from '@vercel/ai-utils'

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

export const runtime = 'edge'

export async function POST() {
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    stream: true,
    messages: [{ role: 'user', content: 'What is love?' }]
  })
  const stream = OpenAIStream(response, {
    async onStart() {
      console.log('streamin yo')
    },
    async onToken(token) {
      console.log('token: ' + token)
    },
    async onCompletion(content) {
      console.log('full text: ' + content)
      // await prisma.messages.create({ content }) or something
    }
  })
  return new StreamingTextResponse(stream)
}
