import { Configuration, OpenAIApi } from 'openai-edge'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { ChatCompletionFunctions } from 'openai-edge/types/api'

// Create an OpenAI API client (that's edge friendly!)
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge'

// TODO this would probably be better derived from zod
const functions: ChatCompletionFunctions[] = [
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
    name: 'get_client_location',
    description: 'Get client location',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_server_location',
    description: 'Get server location',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
]



export async function POST(req: Request) {
  const { messages, function_call } = await req.json()

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo-0613',
    stream: true,
    messages,
    functions,
    function_call
  })

  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
