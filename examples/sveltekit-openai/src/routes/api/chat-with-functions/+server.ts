import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import type { CompletionCreateParams } from 'openai/resources/chat'

import { env } from '$env/dynamic/private'

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || ''
})

const functions: CompletionCreateParams.Function[] = [
  {
    name: 'get_current_weather',
    description: 'Get the current weather',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA'
        },
        format: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description:
            'The temperature unit to use. Infer this from the users location.'
        }
      },
      required: ['location', 'format']
    }
  },
  {
    name: 'get_current_time',
    description: 'Get the current time',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'eval_code_in_browser',
    description: 'Execute javascript code in the browser with eval().',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: `Javascript code that will be directly executed via eval(). Do not use backticks in your response.
           DO NOT include any newlines in your response, and be sure to provide only valid JSON when providing the arguments object.
           The output of the eval() will be returned directly by the function.`
        }
      },
      required: ['code']
    }
  }
]

export async function POST({ request }) {
  const { messages, function_call } = await request.json()

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo-0613',
    stream: true,
    messages,
    functions,
    function_call
  })

  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
