import type { AIStreamOptions, AIStreamParser } from './types'
import { type AIParserPlatform, TEXT_PARSERS } from './parsers'
import {
  createCallbacksTransform,
  createEventStreamTransform
} from './transforms'

export interface AIStreamParams extends AIStreamOptions {
  /**
   * The platform to load a parser for. If no parser is provided, the raw
   * response is returned.
   */
  platform?: AIParserPlatform
}

export type AIStream = (
  res: Response,
  params?: AIStreamParams
) => ReadableStream
export const AIStream: AIStream = (
  res,
  { mode = 'text', platform, ...callbacks } = {}
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

  let parser: AIStreamParser | undefined = undefined

  switch (mode) {
    case 'raw':
      break

    case 'text':
      if (platform) {
        parser = TEXT_PARSERS[platform]()
      }
      break
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
