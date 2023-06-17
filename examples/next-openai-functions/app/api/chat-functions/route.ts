/* eslint-disable turbo/no-undeclared-env-vars */

import { StreamingTextResponse, OpenAIStream } from 'ai'

import { zValidateEnv } from '@/utils'
import { envsSchema } from '@/schemas'
import { Configuration, OpenAIApi } from 'openai'
import { NextResponse } from 'next/server'

interface Function {
  name: string
  description: string
  parameters: object
}

const functionDescription: Function = {
  name: 'get_current_weather',
  description:
    'Get the current weather in a given location, can be more detailed if we have data',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The country, city or/and state, e.g. San Francisco, CA'
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit']
      }
    },
    required: ['location']
  }
}

const { OPENAI_API_KEY, WEATHER_API_KEY } = zValidateEnv(envsSchema)

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY
})

async function get_current_weather(args: { location: string; unit: string }) {
  const res = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${args.location}`
  )

  const data = await res.json()

  return JSON.stringify(data)
}

export async function POST(req: Request, res: NextResponse) {
  const { messages } = await req.json()

  const initialMessage = {
    role: 'user' as const,
    content: messages[messages.length - 1].content as string
  }

  const model = new OpenAIApi(configuration)
  const response = await model.createChatCompletion({
    model: 'gpt-4-0613',
    messages: [initialMessage],
    functions: [functionDescription],
    function_call: 'auto'
  })

  const message = response?.data?.choices?.[0]?.message

  if (message?.function_call && message.function_call.arguments) {
    const functionResponse = await get_current_weather(
      JSON.parse(message.function_call.arguments)
    )

    const response: any = await model.createChatCompletion(
      {
        model: 'gpt-4-0613',
        stream: true,
        messages: [
          initialMessage,
          message,
          {
            role: 'function',
            name: message.function_call.name,
            content: functionResponse
          }
        ]
      },
      {
        responseType: 'stream'
      }
    )

    const stream = OpenAIStream(response)

    return new StreamingTextResponse(stream)
  }

  return NextResponse.json(message?.content)
}
