import { StreamingTextResponse, experimental_StreamData } from '.';
import { cohereBedrockChunks } from '../tests/snapshots/cohere';
import { readAllChunks } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';
import { AWSBedrockCohereStream } from './aws-bedrock-stream';

function simulateBedrockResponse(chunks: any[]) {
  chunks = chunks.slice(); // make a copy
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
  describe('Cohere', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const bedrockResponse = simulateBedrockResponse(cohereBedrockChunks);
      const stream = AWSBedrockCohereStream(bedrockResponse);
      const response = new StreamingTextResponse(stream);

      expect(await readAllChunks(response)).toEqual([
        ' Hi! How can I help you today?',
      ]);
    });

    describe('StreamData protocol', () => {
      it('should send text', async () => {
        const data = new experimental_StreamData();

        const bedrockResponse = simulateBedrockResponse(cohereBedrockChunks);
        const stream = AWSBedrockCohereStream(bedrockResponse, {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        });

        const response = new StreamingTextResponse(stream, {}, data);

        expect(await readAllChunks(response)).toEqual([
          '0:" Hi! How can I help you today?"\n',
        ]);
      });

      it('should send text and data', async () => {
        const data = new experimental_StreamData();

        data.append({ t1: 'v1' });

        const bedrockResponse = simulateBedrockResponse(cohereBedrockChunks);
        const stream = AWSBedrockCohereStream(bedrockResponse, {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        });

        const response = new StreamingTextResponse(stream, {}, data);

        expect(await readAllChunks(response)).toEqual([
          '2:[{"t1":"v1"}]\n',
          '0:" Hi! How can I help you today?"\n',
        ]);
      });
    });
  });
});
