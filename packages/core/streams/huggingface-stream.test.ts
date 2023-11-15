import { HfInference } from '@huggingface/inference';
import {
  HuggingFaceStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('HuggingFace stream', () => {
  const Hf = new HfInference();

  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3033);
  });
  afterAll(async () => server.teardown());

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse HuggingFace response and receive the streamed response', async () => {
    const stream = HuggingFaceStream(
      Hf.textGenerationStream(
        { model: 'model', inputs: '' },
        {
          fetch() {
            return fetch(server.api, {
              headers: {
                'x-mock-service': 'huggingface',
                'x-mock-type': 'chat',
              },
            });
          },
        },
      ),
    );

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([
      'Hello',
      ',',
      ' world',
      '.',
    ]);
  });

  describe('StreamData prototcol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const stream = HuggingFaceStream(
        Hf.textGenerationStream(
          { model: 'model', inputs: '' },
          {
            fetch() {
              return fetch(server.api, {
                headers: {
                  'x-mock-service': 'huggingface',
                  'x-mock-type': 'chat',
                },
              });
            },
          },
        ),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const stream = HuggingFaceStream(
        Hf.textGenerationStream(
          { model: 'model', inputs: '' },
          {
            fetch() {
              return fetch(server.api, {
                headers: {
                  'x-mock-service': 'huggingface',
                  'x-mock-type': 'chat',
                },
              });
            },
          },
        ),
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
      );

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });
  });
});
