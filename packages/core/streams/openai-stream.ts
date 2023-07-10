import { Message } from '../shared/types'
import { nanoid } from '../shared/utils'
import {
  AIStream,
  trimStartOfStreamHelper,
  type AIStreamCallbacks
} from './ai-stream'

/**
 * Creates a parser function for processing the OpenAI stream data.
 * The parser extracts and trims text content from the JSON data. This parser
 * can handle data for chat or completion models.
 *
 * @return {(data: string) => string | void} A parser function that takes a JSON string as input and returns the extracted text content or nothing.
 */
function parseOpenAIStream(): (data: string) => string | void {
  const trimStartOfStream = trimStartOfStreamHelper()
  return data => {
    const json = JSON.parse(data)

    /*
       If the response is a function call, the first streaming chunk from OpenAI returns the name of the function like so

          {
            ...
            "choices": [{
              "index": 0,
              "delta": {
                "role": "assistant",
                "content": null,
                "function_call": {
                  "name": "get_current_weather",
                  "arguments": ""
                }
              },
              "finish_reason": null
            }]
          }

       Then, it begins streaming the arguments for the function call.
       The second chunk looks like:

          {
            ...
            "choices": [{
              "index": 0,
              "delta": {
                "function_call": {
                  "arguments": "{\n"
                }
              },
              "finish_reason": null
            }]
          }

        Third chunk:

          {
            ...
            "choices": [{
              "index": 0,
              "delta": {
                "function_call": {
                  "arguments": "\"location"
                }
              },
              "finish_reason": null
            }]
          }

        ...

        Finally, the last chunk has a `finish_reason` of `function_call`:

          {
            ...
            "choices": [{
              "index": 0,
              "delta": {},
              "finish_reason": "function_call"
            }]
          }


        With the implementation below, the client will end up getting a
        response like the one below streamed to them whenever a function call
        response is returned:

          {
            "function_call": {
              "name": "get_current_weather",
              "arguments": "{\"location\": \"San Francisco, CA\", \"format\": \"celsius\"}
            }
          }
     */
    if (json.choices[0]?.delta?.function_call?.name) {
      return `{"function_call": {"name": "${json.choices[0]?.delta?.function_call.name}", "arguments": "`
    } else if (json.choices[0]?.delta?.function_call?.arguments) {
      const argumentChunk: string =
        json.choices[0].delta.function_call.arguments

      let escapedPartialJson = argumentChunk
        .replace(/\\/g, '\\\\') // Replace backslashes first to prevent double escaping
        .replace(/\//g, '\\/') // Escape slashes
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/\n/g, '\\n') // Escape new lines
        .replace(/\r/g, '\\r') // Escape carriage returns
        .replace(/\t/g, '\\t') // Escape tabs
        .replace(/\f/g, '\\f') // Escape form feeds

      return `${escapedPartialJson}`
    } else if (json.choices[0]?.finish_reason === 'function_call') {
      return '"}}'
    }

    const text = trimStartOfStream(
      json.choices[0]?.delta?.content ?? json.choices[0]?.text ?? ''
    )
    return text
  }
}
export function OpenAIStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  const stream = AIStream(res, parseOpenAIStream(), cb)

  if (cb && cb.onFunctionCall) {
    const functionCallTransformer = createFunctionCallTransformer(cb)
    return stream.pipeThrough(functionCallTransformer)
  } else {
    return stream
  }
}
function createFunctionCallTransformer(
  callbacks: AIStreamCallbacks
): TransformStream<Uint8Array, Uint8Array> {
  const textEncoder = new TextEncoder()
  let isFirstChunk = true
  let aggregatedResponse = ''
  let isFunctionStreamingIn = false

  return new TransformStream({
    async transform(chunk, controller): Promise<void> {
      const message = new TextDecoder().decode(chunk)
      let newMessages: Message[] = []

      const shouldHandleAsFunction =
        isFirstChunk && message.startsWith('{"function_call":')
      const isEndOfFunction =
        !isFirstChunk &&
        callbacks.onFunctionCall &&
        isFunctionStreamingIn &&
        message.endsWith('"}}')

      if (shouldHandleAsFunction) {
        isFunctionStreamingIn = true
        aggregatedResponse += message
        console.log('Function call detected')
        isFirstChunk = false
        return
      }

      // Stream as normal
      if (!isFunctionStreamingIn) {
        controller.enqueue(textEncoder.encode(message))
        return
      } else {
        aggregatedResponse += message
      }

      if (isEndOfFunction) {
        console.log('End of function call detected', aggregatedResponse)
        isFunctionStreamingIn = false
        const payload = JSON.parse(aggregatedResponse)
        const argumentsPayload = JSON.parse(payload.function_call.arguments)

        // TODO: this should never happen but TS is unhappy
        if (!callbacks.onFunctionCall) {
          return
        }

        const functionResult = await callbacks.onFunctionCall(
          {
            name: payload.function_call.name,
            arguments: argumentsPayload
          },
          newMessages
        )

        if (!functionResult) {
          // The user didn't do anything with the function call on the server and wants
          // to either do nothing or run it on the client
          // so we just return the function call as a message
          controller.enqueue(textEncoder.encode(aggregatedResponse))
          return
        }

        newMessages.push({
          role: 'function',
          name: payload.function_call.name,
          content: JSON.stringify(functionResult),
          id: nanoid(),
          createdAt: new Date()
        })

        const openAIStream = OpenAIStream(functionResult, callbacks)
        const reader = openAIStream.getReader()

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          controller.enqueue(value)
        }
      }
    }
  })
}
