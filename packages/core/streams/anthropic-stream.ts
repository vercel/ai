import { AIStream, type AIStreamCallbacks } from './ai-stream'

/**
 * Parses the anthropic stream data.
 * @returns A function that accepts a string `data` and returns a parsed string or `void`.
 */
function parseAnthropicStream(): (data: string) => string | void {
  let previous = ''

  /**
   * @param data - The input data string to parse.
   * @throws An error if the data contains an error event.
   * @returns The parsed delta or `void`.
   */
  return function (data: string): string | void {
    const json = JSON.parse(data as string) as
      | {
          completion: string
          stop: string | null
          stop_reason: string | null
          truncated: boolean
          log_id: string
          model: string
          exception: string | null
        }
      | {
          error: {
            type: string
            message: string
          }
        }

    /**
     * Handles the error event.
     * @event
     * @property data - The data for the error event.
     * @property data.error - The error details.
     * @property data.error.type - The type of the error (e.g., "overloaded_error").
     * @property data.error.message - The message for the error (e.g., "Overloaded").
     */
    if ('error' in json) {
      throw new Error(json.error.message)
    }

    /**
     * Handles the ping event.
     * @event
     * @property data - The data for the ping event (empty object).
     */
    if (!json.completion) {
      return
    }

    // Anthropic's `completion` field is cumulative unlike OpenAI's
    // deltas. In order to compute the delta, we must slice out the text
    // we previously received.
    const text = json.completion
    const delta = text.slice(previous.length)
    previous = text

    return delta
  }
}

export function AnthropicStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseAnthropicStream(), cb)
}
