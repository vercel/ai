'use client'

import { Message } from 'ai/react'
import { useChat } from 'ai/react'
import { ChatRequest, FunctionCallHandler, nanoid } from 'ai'

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

      // Generate a fake temperature
      const temperature = Math.floor(Math.random() * (100 - 30 + 1) + 30)
      // Generate random weather condition
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
      return functionResponse
    } else if (functionCall.name === 'get_current_time') {
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
        ]
        // You can also (optionally) return a list of functions here that the model can call next
        // functions
      }

      return functionResponse
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
        return functionResponse
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
    if (m.content === '' && m.function_call !== undefined) {
      const functionCallString =
        typeof m.function_call === 'string'
          ? m.function_call
          : JSON.stringify(m.function_call)
      return (
        <>
          {functionCallString.split('\\n').map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </>
      )
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
              <strong>{`${m.role}: `}</strong>
              {getRenderedMessage(m)}
              <br />
              <br />
            </div>
          ))
        : null}
      <div id="chart-goes-here"></div>

      <form onSubmit={handleSubmit}>
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
