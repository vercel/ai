import {
  CohereStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('CohereStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3032);
  });
  afterAll(async () => server.teardown());

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

  describe('StreamData prototcol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const stream = CohereStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'cohere',
            'x-mock-type': 'chat',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:" "\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const stream = CohereStream(
        await fetch(server.api, {
          headers: {
            'x-mock-service': 'cohere',
            'x-mock-type': 'chat',
          },
        }),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:"[{\\"t1\\":\\"v1\\"}]"\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:" "\n',
      ]);
    });
  });
});
