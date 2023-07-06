"use client"
import { Message } from 'ai/react'
import { useChat } from 'ai/react'
import { functionCallHandler } from '../../ai'


export default function Chat() {
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
