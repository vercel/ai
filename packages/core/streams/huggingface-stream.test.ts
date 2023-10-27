import { HfInference } from '@huggingface/inference';
import { HuggingFaceStream, StreamingTextResponse } from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('HuggingFace stream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3033);
  });
  afterAll(() => {
    server.teardown();
  });

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse HuggingFace response and receive the streamed response', async () => {
    const Hf = new HfInference();

    const hfResponse = Hf.textGenerationStream(
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
    );

    // Convert the async generator into a friendly text-stream
    const stream = HuggingFaceStream(hfResponse);

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([
      'Hello',
      ',',
      ' world',
      '.',
    ]);
  });
});
