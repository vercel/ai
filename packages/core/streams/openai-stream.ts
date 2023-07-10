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

/**
 * Processes the response of an OpenAI API call and returns a ReadableStream.
 * It employs conditional stream processing to efficiently handle both 2xx and non-2xx HTTP responses.
 *
 * For 2xx HTTP responses:
 * - The function continues with standard stream processing.
 *
 * For non-2xx HTTP responses:
 * - If the response body is not null, it asynchronously extracts and decodes the response body.
 * - It then creates a custom ReadableStream to propagate a detailed error message.
 *
 * This approach ensures that the synchronous nature of the function is preserved while providing
 * detailed error handling for non-2xx responses.
 *
 * @param {Response} res - The Response object from the OpenAI API call.
 * @param {AIStreamCallbacks} [cb] - Optional callback functions to handle stream lifecycle events.
 * @return {ReadableStream} A readable stream with the parsed content from the OpenAI API response or a stream with an error message for non-2xx responses.
 * @throws Will throw an error if the response is not OK and there is no response body.
 */
export function OpenAIStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseOpenAIStream(), cb)
}
