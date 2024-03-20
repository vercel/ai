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
}: {
  url: string;
  chunks: string[];
}) {
  async function* generateChunks() {
    const encoder = new TextEncoder();
    for (const chunk of chunks) {
      yield encoder.encode(chunk);
    }
  }

  mockFetchDataStreamWithGenerator({
    url,
    chunkGenerator: generateChunks(),
  });
}

export function mockFetchDataStreamWithGenerator({
  url,
  chunkGenerator,
}: {
  url: string;
  chunkGenerator: AsyncGenerator<Uint8Array, void, unknown>;
}) {
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    return {
      url,
      ok: true,
      status: 200,
      bodyUsed: false,
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
