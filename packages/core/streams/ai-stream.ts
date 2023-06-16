import {
  createCallbacksTransform,
  createEventStreamTransform
} from './transforms'
import type { AIStreamOptions, AIStreamParser } from './types'

export interface AIStreamParams extends AIStreamOptions {
  parser?: AIStreamParser
}

export type AIStream = (
  res: Response,
  params?: AIStreamParams
) => ReadableStream
export const AIStream: AIStream = (
  res,
  { parser, ...callbacks } = {}
) => {
  /**
   * If the response is not OK, we want to throw an error to indicate that the
   * AI service is not available. 
   * 
   * When catching this error, we can check the status code and return a handled
   * error response to the client.
   */
  if (!res.ok) {
    throw new Error(
      `Failed to convert the response to stream. Received status code: ${res.status}.`
    )
  }

  const stream =
    res.body ||
    new ReadableStream({
      start(controller) {
        controller.close()
      }
    })

  return stream
    .pipeThrough(createEventStreamTransform(parser))
    .pipeThrough(createCallbacksTransform(callbacks))
}
