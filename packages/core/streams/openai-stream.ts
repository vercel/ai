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
  if (res.ok) {
    return AIStream(res, parseOpenAIStream(), cb)
  } else {
    if (res.body) {
      const reader = res.body.getReader()
      return new ReadableStream({
        async start(controller) {
          const { done, value } = await reader.read()
          if (!done) {
            const errorText = new TextDecoder().decode(value)
            controller.error(new Error(`Response error: ${errorText}`))
          }
        }
      })
    } else {
      return new ReadableStream({
        start(controller) {
          controller.error(new Error('Response error: No response body'))
        }
      })
    }
  }
}
