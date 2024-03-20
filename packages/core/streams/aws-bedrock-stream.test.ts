import { StreamingTextResponse, experimental_StreamData } from '.';
import {
  bedrockAnthropicChunks,
  bedrockCohereChunks,
  bedrockLlama2Chunks,
} from '../tests/snapshots/aws-bedrock';
import { readAllChunks } from '../tests/utils/mock-client';
import {
  AWSBedrockAnthropicStream,
  AWSBedrockCohereStream,
  AWSBedrockLlama2Stream,
} from './aws-bedrock-stream';

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
  describe('Anthropic', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const bedrockResponse = simulateBedrockResponse(bedrockAnthropicChunks);
      const stream = AWSBedrockAnthropicStream(bedrockResponse, {
        onFinal() {
          data.close();
        },
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const bedrockResponse = simulateBedrockResponse(bedrockAnthropicChunks);
      const stream = AWSBedrockAnthropicStream(bedrockResponse, {
        onFinal() {
          data.close();
        },
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });
  });

  describe('Cohere', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const bedrockResponse = simulateBedrockResponse(bedrockCohereChunks);
      const stream = AWSBedrockCohereStream(bedrockResponse, {
        onFinal() {
          data.close();
        },
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:" Hi! How can I help you today?"\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const bedrockResponse = simulateBedrockResponse(bedrockCohereChunks);
      const stream = AWSBedrockCohereStream(bedrockResponse, {
        onFinal() {
          data.close();
        },
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:" Hi! How can I help you today?"\n',
      ]);
    });
  });

  describe('Llama2', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const bedrockResponse = simulateBedrockResponse(bedrockLlama2Chunks);
      const stream = AWSBedrockLlama2Stream(bedrockResponse, {
        onFinal() {
          data.close();
        },
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '0:""\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:""\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const bedrockResponse = simulateBedrockResponse(bedrockLlama2Chunks);
      const stream = AWSBedrockLlama2Stream(bedrockResponse, {
        onFinal() {
          data.close();
        },
      });

      const response = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(response)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:""\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
        '0:""\n',
      ]);
    });
  });
});
