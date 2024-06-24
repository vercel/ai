import { fail } from 'node:assert';
import { vi } from 'vitest';

export function mockFetchTextStream({
  url,
  chunks,
}: {
  url: string;
  chunks: string[];
}) {
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    function* generateChunks() {
      for (const chunk of chunks) {
        yield new TextEncoder().encode(chunk);
      }
    }

    const chunkGenerator = generateChunks();

    return {
      url,
      ok: true,
      status: 200,
      bodyUsed: false,
      headers: new Map() as any as Headers,
      body: {
        getReader() {
          return {
            read() {
              return Promise.resolve(chunkGenerator.next());
            },
            releaseLock() {},
            cancel() {},
          };
        },
      },
    } as unknown as Response;
  });
}

export function mockFetchDataStream({
  url,
  chunks,
  maxCalls,
}: {
  url: string;
  chunks: string[];
  maxCalls?: number;
}) {
  async function* generateChunks() {
    const encoder = new TextEncoder();
    for (const chunk of chunks) {
      yield encoder.encode(chunk);
    }
  }

  return mockFetchDataStreamWithGenerator({
    url,
    chunkGenerator: generateChunks(),
    maxCalls,
  });
}

export function mockFetchDataStreamWithGenerator({
  url,
  chunkGenerator,
  maxCalls,
}: {
  url: string;
  chunkGenerator: AsyncGenerator<Uint8Array, void, unknown>;
  maxCalls?: number;
}) {
  let requestBodyResolve: ((value?: unknown) => void) | undefined;
  const requestBodyPromise = new Promise(resolve => {
    requestBodyResolve = resolve;
  });

  let callCount = 0;

  vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    if (maxCalls !== undefined && ++callCount >= maxCalls) {
      throw new Error('Too many calls');
    }

    requestBodyResolve?.(init!.body as string);

    return {
      url,
      ok: true,
      status: 200,
      bodyUsed: false,
      body: new ReadableStream({
        async start(controller) {
          for await (const chunk of chunkGenerator) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
    } as Response;
  });

  return {
    requestBody: requestBodyPromise,
  };
}

export function mockFetchError({
  statusCode,
  errorMessage,
}: {
  statusCode: number;
  errorMessage: string;
}) {
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    return {
      url: 'https://example.com/api/chat',
      ok: false,
      status: statusCode,
      bodyUsed: false,
      body: {
        getReader() {
          return {
            read() {
              return Promise.resolve(errorMessage);
            },
            releaseLock() {},
            cancel() {},
          };
        },
      },
      text: () => Promise.resolve(errorMessage),
    } as unknown as Response;
  });
}
