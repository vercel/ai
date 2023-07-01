import { nanoid } from 'ai'
import { z } from 'zod'
import { action, app } from 'lusat'
import { callFunction, gptFunctions } from 'lusat/adapters/openai'

const { actions } = app({
  actions: {
    getCurrentWeather: action()
      .describe('Get the current weather.')
      .input(
        z.object({
          location: z
            .string()
            .describe('The city and state, e.g. San Francisco, CA'),
          format: z
            .enum(['celsius', 'fahrenheit'])
            .describe(
              'The temperature unit to use. Infer this from the users location.'
            )
        })
      )
      .handle(() => {
        // Generate a fake temperature
        const temperature = Math.floor(Math.random() * (100 - 30 + 1) + 30)
        // Generate random weather condition
        const weather = ['sunny', 'cloudy', 'rainy', 'snowy'][
          Math.floor(Math.random() * 4)
        ]
        return {
          temperature,
          weather,
          info: 'This data is randomly generated and came from a fake weather API!'
        }
      }),
    getCurrentTime: action()
      .describe('Get the current time.')
      .handle(() => {
        const time = new Date().toLocaleTimeString()
        return { time }
      }),
    evalCodeInBrowser: action()
      .describe('Execute javascript code in the browser with eval().')
      .input(
        z.object({
          code: z
            .string()
            .describe(
              'Javascript code that will be directly executed via eval(). Do not use backticks in your response. DO NOT include any newlines in your response, and be sure to provide only valid JSON when providing the arguments object. The output of the eval() will be returned directly by the function.'
            )
        })
      )
      .handle(({ code }) => {
        return eval(code)
      })
  }
})

const functions = gptFunctions(actions)

const call = (functionCall: Parameters<typeof callFunction>[0]) => ({
  id: nanoid(),
  name: functionCall.name,
  role: 'function' as const,
  content: JSON.stringify(callFunction(functionCall, actions))
})

export { call, functions, actions }
