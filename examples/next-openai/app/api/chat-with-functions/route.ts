import { Configuration, OpenAIApi } from 'openai-edge'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { experimental_ChatFunctionHandler } from 'ai/functions'

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

export const runtime = 'edge'

const functions: experimental_ChatFunctionHandler =
  new experimental_ChatFunctionHandler([
    {
      function: {
        name: 'get_current_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get the weather for'
            },
            format: {
              type: 'string',
              enum: ['celsius', 'fahrenheit']
            }
          },
          required: ['location', 'format']
        }
      },
      handler: async (
        { location, format },
        createFunctionCallMessages,
        messages = []
      ) => {
        // Call a weather API here
        const weatherData = {
          temperature: 20,
          unit: format === 'celsius' ? 'C' : 'F'
        }

        return openai.createChatCompletion({
          model: 'gpt-3.5-turbo-0613',
          stream: true,
          messages: [
            ...messages,
            ...(createFunctionCallMessages(weatherData) as any)
          ],
          functions: functions.schemas
        })
      }
    },
    {
      function: {
        name: 'eval_code_in_browser',
        description: 'Execute javascript code in the browser with eval().',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: `Javascript code that will be directly executed via eval(). Do not use backticks in your response.`
            }
          }
        }
      }
    }
  ])

export async function POST(req: Request) {
  const { messages } = await req.json()

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo-0613',
    stream: true,
    messages,
    functions: functions.schemas
  })

  const stream = OpenAIStream(response, {
    experimental_onFunctionCall: functions.onFunctionCallHandler(messages)
  })

  return new StreamingTextResponse(stream)
}
