import type { OutgoingHttpHeaders, ServerResponse } from 'node:http'

/**
 * A utility class for streaming text responses.
 */
export class StreamingTextResponse extends Response {
  constructor(res: ReadableStream, init?: ResponseInit) {
    super(res as any, {
      ...init,
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...init?.headers
      }
    })
  }
}

/**
 * A simple utility function to convert a ReadableStream to a Node.js Readable.
 * This is campatible with Node.js 18 web streams and polyfill-stream package both.
 */
export function streamToNodeReadable(stream: ReadableStream) {
  const reader = stream.getReader()
  let closed = false

  // in order to avoid module check error
  const Readable = require('stream')
    .Readable as typeof import('stream').Readable

  const readable = new Readable({
    read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            this.push(null)
          } else {
            this.push(value)
          }
        })
        .catch(e => {
          readable.destroy(e)
        })
    },
    destroy(error, callback) {
      const done = () => {
        try {
          callback(error)
        } catch (err: unknown) {
          process.nextTick(() => {
            throw err
          })
        }
      }

      if (!closed) {
        reader.cancel(error).then(done, done)
        return
      }
      done()
    }
  })

  reader.closed.then(
    () => {
      closed = true
    },
    error => {
      readable.destroy(error)
    }
  )

  return readable
}

/**
 * A utility function to get a OutgoingHttpHeaders from a HeadersInit.
 */
export function headersInitToOutgoingHeaders(headers: HeadersInit | undefined) {
  const h = new Headers(headers)
  const outgoingHeaders: OutgoingHttpHeaders = {}
  h.forEach((value, key) => {
    if (
      key === 'set-cookie' &&
      'getSetCookie' in h &&
      typeof h.getSetCookie === 'function'
    ) {
      // nodejs 18.14.1 supports it, otherwise developer should polyfill this method for their own
      outgoingHeaders[key] = h.getSetCookie()
      return
    }
    outgoingHeaders[key] = value
  })
  return outgoingHeaders
}

/**
 * A utility function to stream a ReadableStream to a Node.js response-like object.
 */
export function streamToResponse(
  res: ReadableStream,
  response: ServerResponse,
  init?: { headers?: HeadersInit; status?: number }
) {
  if (response.destroyed || response.writableEnded || response.headersSent) {
    return res.cancel(new Error('Server response is already used'))
  }

  // start write the response headers
  response.writeHead(init?.status || 200, {
    'content-type': 'text/plain; charset=utf-8',
    ...headersInitToOutgoingHeaders(init?.headers)
  })

  // pipe from node readable to server response
  // which supports backpresure mechanism
  const readable = streamToNodeReadable(res)

  const pipeline = require('node:stream')
    .pipeline as typeof import('node:stream').pipeline
  return new Promise<void>((resolve, reject) => {
    pipeline(readable, response, error => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}
