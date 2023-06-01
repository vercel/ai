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
