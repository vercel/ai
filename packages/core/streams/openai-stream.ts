import { CreateMessage } from '../shared/types'

import {
  AIStream,
  trimStartOfStreamHelper,
  type AIStreamCallbacks,
  FunctionCallPayload
} from './ai-stream'

type JSONValue =
  | null
  | string
  | number
  | boolean
  | { [x: string]: JSONValue }
  | Array<JSONValue>

export type OpenAIStreamCallbacks = AIStreamCallbacks & {
  /**
   * @example
   * ```js
   * const response = await openai.createChatCompletion({
   *   model: 'gpt-3.5-turbo-0613',
   *   stream: true,
   *   messages,
   *   functions,
   * })
   *
   * const stream = OpenAIStream(response, {
   *   experimental_onFunctionCall: async (functionCallPayload, createFunctionCallMessages) => {
   *     // ... run your custom logic here
   *     const result = await myFunction(functionCallPayload)
   *
   *     // Ask for another completion, or return a string to send to the client as an assistant message.
   *     return await openai.createChatCompletion({
   *       model: 'gpt-3.5-turbo-0613',
   *       stream: true,
   *       // Append the relevant "assistant" and "function" call messages
   *       messages: [...messages, ...createFunctionCallMessages(result)],
   *       functions,
   *     })
   *   }
   * })
   * ```
   */
  experimental_onFunctionCall?: (
    functionCallPayload: FunctionCallPayload,
    createFunctionCallMessages: (
      functionCallResult: JSONValue
    ) => CreateMessage[]
  ) => Promise<Response | undefined | void | string>
}

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

const __internal__OpenAIFnMessagesSymbol = Symbol('internal_openai_fn_messages')

export function OpenAIStream(
  res: Response,
  callbacks?: OpenAIStreamCallbacks
): ReadableStream {
  // Annotate the internal `messages` property for recursive function calls
  const cb:
    | undefined
    | (OpenAIStreamCallbacks & {
        [__internal__OpenAIFnMessagesSymbol]?: CreateMessage[]
      }) = callbacks

  const stream = AIStream(res, parseOpenAIStream(), cb)

  if (cb && cb.experimental_onFunctionCall) {
    const functionCallTransformer = createFunctionCallTransformer(cb)
    return stream.pipeThrough(functionCallTransformer)
  } else {
    return stream
  }
}

function createFunctionCallTransformer(
  callbacks: OpenAIStreamCallbacks & {
    [__internal__OpenAIFnMessagesSymbol]?: CreateMessage[]
  }
): TransformStream<Uint8Array, Uint8Array> {
  const textEncoder = new TextEncoder()
  let isFirstChunk = true
  let aggregatedResponse = ''
  let isFunctionStreamingIn = false

  let functionCallMessages: CreateMessage[] =
    callbacks[__internal__OpenAIFnMessagesSymbol] || []

  return new TransformStream({
    async transform(chunk, controller): Promise<void> {
      const message = new TextDecoder().decode(chunk)

      const shouldHandleAsFunction =
        isFirstChunk && message.startsWith('{"function_call":')

      if (shouldHandleAsFunction) {
        isFunctionStreamingIn = true
        aggregatedResponse += message
        isFirstChunk = false
        return
      }

      // Stream as normal
      if (!isFunctionStreamingIn) {
        controller.enqueue(chunk)
        return
      } else {
        aggregatedResponse += message
      }
    },
    async flush(controller): Promise<void> {
      const isEndOfFunction =
        !isFirstChunk &&
        callbacks.experimental_onFunctionCall &&
        isFunctionStreamingIn

      // This callbacks.experimental_onFunctionCall check should not be necessary but TS complains
      if (isEndOfFunction && callbacks.experimental_onFunctionCall) {
        isFunctionStreamingIn = false
        const payload = JSON.parse(aggregatedResponse)
        const argumentsPayload = JSON.parse(payload.function_call.arguments)

        // Append the function call message to the list
        let newFunctionCallMessages: CreateMessage[] = [...functionCallMessages]

        const functionResponse = await callbacks.experimental_onFunctionCall(
          {
            name: payload.function_call.name,
            arguments: argumentsPayload
          },
          result => {
            // Append the function call request and result messages to the list
            newFunctionCallMessages = [
              ...functionCallMessages,
              {
                role: 'assistant',
                content: '',
                function_call: payload.function_call
              },
              {
                role: 'function',
                name: payload.function_call.name,
                content: JSON.stringify(result)
              }
            ]

            // Return it to the user
            return newFunctionCallMessages
          }
        )

        if (!functionResponse) {
          // The user didn't do anything with the function call on the server and wants
          // to either do nothing or run it on the client
          // so we just return the function call as a message
          controller.enqueue(textEncoder.encode(aggregatedResponse))
          return
        } else if (typeof functionResponse === 'string') {
          // The user returned a string, so we just return it as a message
          controller.enqueue(textEncoder.encode(functionResponse))
          return
        }

        // Recursively
        const openAIStream = OpenAIStream(functionResponse, {
          ...callbacks,
          [__internal__OpenAIFnMessagesSymbol]: newFunctionCallMessages
        } as AIStreamCallbacks)

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
