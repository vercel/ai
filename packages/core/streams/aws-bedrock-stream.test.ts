import { StreamingTextResponse } from '.';
import { cohereBedrockChunks } from '../tests/snapshots/cohere';
import { readAllChunks } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';
import { AWSBedrockCohereStream } from './aws-bedrock-stream';

function simulateBedrockResponse(chunks: any[]) {
  return {
    body: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            const chunk = chunks.shift();
            if (chunk) {
              const bytes = new TextEncoder().encode(JSON.stringify(chunk));
              return Promise.resolve({
                value: { chunk: { bytes } },
                done: false,
              });
            } else {
              return Promise.resolve({ done: true });
            }
          },
        };
      },
    } as AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>,
  };
}

describe('AWS Bedrock', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3032);
  });
  afterAll(async () => server.teardown());

  describe('Cohere', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const bedrockResponse = simulateBedrockResponse(cohereBedrockChunks);
      const stream = AWSBedrockCohereStream(bedrockResponse);
      const response = new StreamingTextResponse(stream);

      expect(await readAllChunks(response)).toEqual([
        ' Hi! How can I help you today?',
      ]);
    });
  });
});
