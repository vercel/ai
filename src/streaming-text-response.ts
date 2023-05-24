/**
 * A utility class for streaming text responses.
 */
export class StreamingTextResponse extends Response {
  constructor(res: ReadableStream, init?: ResponseInit) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    super(res as any, {
      ...init,
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        ...init?.headers,
      },
    });
  }
}
