import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('CohereStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3032);
  });
  afterAll(() => {
    server.teardown();
  });

  jest.mock('uuid', () => {
    let count = 0;
    return {
      v4: () => `uuid-${count++}`,
    };
  });

  const { CohereStream, StreamingTextResponse, experimental_StreamData } =
    require('.') as typeof import('.');

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse SSE and receive the streamed response', async () => {
    const stream = CohereStream(
      await fetch(server.api, {
        headers: {
          'x-mock-service': 'cohere',
          'x-mock-type': 'chat',
        },
      }),
    );

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([
      ' Hello',
      ',',
      ' world',
      '.',
      ' ',
    ]);
  });
});
