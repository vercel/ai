import {
  CohereStream,
  ReplicateStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { experimental_buildLlama2Prompt } from '../prompts';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';
import Replicate from 'replicate';

describe('ReplicateStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3034);
  });
  afterAll(() => {
    server.teardown();
  });

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse SSE and receive the streamed response', async () => {
    const replicate = new Replicate({});

    const replicateResponse = await replicate.predictions.create({
      stream: true,
      version:
        'ac944f2e49c55c7e965fc3d93ad9a7d9d947866d6793fb849dd6b4747d0c061c',
      input: {
        prompt: experimental_buildLlama2Prompt([
          {
            role: 'user',
            content: 'Hello, world.',
          },
        ]),
      },
    });

    // Convert the response into a friendly text-stream
    const stream = await ReplicateStream(replicateResponse);

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
