'use client'

import { ChatCompletionFunctions } from 'openai-edge/types/api'
import { Message } from 'ai/react'
import { useChat } from 'ai/react'
import { ChatRequest, FunctionCallHandler, nanoid } from 'ai'

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

export default function Chat() {
  const functionCallHandler: FunctionCallHandler = async (
    chatMessages,
    functionCall
  ) => {
    if (functionCall.name === 'get_current_weather') {
      if (functionCall.arguments) {
        const parsedFunctionCallArguments = JSON.parse(functionCall.arguments)
        // You now have access to the parsed arguments here (assuming the JSON was valid)
        // If JSON is invalid, return an appropriate message to the model so that it may retry?
        console.log(parsedFunctionCallArguments)
      }

      // Generate a random number between 30 and 100 for fake temperature
      const temperature = Math.floor(Math.random() * (100 - 30 + 1) + 30)
      // Generate random weather condition from the options of 'sunny' 'cloudy' 'rainy' 'snowy'
      const weather = ['sunny', 'cloudy', 'rainy', 'snowy'][
        Math.floor(Math.random() * 4)
      ]

      const functionResponse: ChatRequest = {
        messages: [
          ...chatMessages,
          {
            id: nanoid(),
            name: 'get_current_weather',
            role: 'function' as const,
            content: JSON.stringify({
              temperature,
              weather,
              info: 'This data is randomly generated and came from a fake weather API!'
            })
          }
        ]
      }
      return Promise.resolve(functionResponse)
    } else if (functionCall.name === 'get_current_time') {
      // Get current time
      const time = new Date().toLocaleTimeString()
      const functionResponse: ChatRequest = {
        messages: [
          ...chatMessages,
          {
            id: nanoid(),
            name: 'get_current_time',
            role: 'function' as const,
            content: JSON.stringify({ time })
          }
        ],
        // You can return a list of functions here that the model can call next
        functions
      }

      return Promise.resolve(functionResponse)
    } else if (functionCall.name === 'eval_code_in_browser') {
      if (functionCall.arguments) {
        // Parsing here does not always work since it seems that some characters in generated code aren't escaped properly.
        const parsedFunctionCallArguments: { code: string } = JSON.parse(
          functionCall.arguments
        )
        const functionResponse = {
          messages: [
            ...chatMessages,
            {
              id: nanoid(),
              name: 'eval_code_in_browser',
              role: 'function' as const,
              content: JSON.stringify(eval(parsedFunctionCallArguments.code))
            }
          ]
        }
        return Promise.resolve(functionResponse)
      }
    }
  }

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat-with-functions',
    experimental_onFunctionCall: functionCallHandler
  })

  // Generate a map of message role to text color
  const roleToColorMap: Record<Message['role'], string> = {
    system: 'red',
    user: 'black',
    function: 'blue',
    assistant: 'green'
  }

  const getRenderedMessage = (m: Message) => {
    if (m.content === '') {
      if (typeof m.function_call === 'string') {
        return (
          (
            <>
              <p>**** Function Call! **** </p>
              {m.function_call.split('\\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </>
          ) ?? ''
        )
      } else {
        return (
          (
            <>
              <p>**** {m.function_call?.name!} Function Call! **** </p>
              {m.function_call?.arguments!.split('\\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </>
          ) ?? ''
        )
      }
    } else {
      return m.content
    }
  }

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.length > 0
        ? messages.map((m: Message) => (
            <div
              key={m.id}
              className="whitespace-pre-wrap"
              style={{ color: roleToColorMap[m.role] }}
            >
              <strong>{`${
                m.role.charAt(0).toUpperCase() + m.role.slice(1)
              }: `}</strong>
              {getRenderedMessage(m)}
              <br />
              <br />
            </div>
          ))
        : null}
      <div id="chart-goes-here"></div>

      <form onSubmit={e => handleSubmit(e, { functions })}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  )
}
