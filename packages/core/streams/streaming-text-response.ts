import type { ServerResponse } from 'node:http'
import { experimental_StreamData } from './stream-data'
import { COMPLEX_HEADER } from '../shared/utils'

/**
 * A utility class for streaming text responses.
 */
export class StreamingTextResponse extends Response {
  constructor(
    res: ReadableStream,
    init?: ResponseInit,
    data?: experimental_StreamData
  ) {
    let processedStream = res

    if (data) {
      processedStream = res.pipeThrough(data.stream)
    }

    super(processedStream as any, {
      ...init,
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        [COMPLEX_HEADER]: data ? 'true' : 'false',
        ...init?.headers
      }
    })
  }
}

/**
 * A utility function to stream a ReadableStream to a Node.js response-like object.
 */
export function streamToResponse(
  res: ReadableStream,
  response: ServerResponse,
  init?: { headers?: Record<string, string>; status?: number }
) {
  response.writeHead(init?.status || 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...init?.headers
  })

  const reader = res.getReader()
  function read() {
    reader.read().then(({ done, value }: { done: boolean; value?: any }) => {
      if (done) {
        response.end()
        return
      }
      response.write(value)
      read()
    })
  }
  read()
}
