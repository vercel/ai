import { StreamingTextResponse, experimental_StreamData } from '.';
import {
  sageMakerHuggingFaceChunks,
} from '../tests/snapshots/aws-sagemaker';
import { readAllChunks } from '../tests/utils/mock-client';
import {
  AWSSageMakerHuggingFaceStream,
} from './aws-sagemaker-stream';

function simulateSageMakerResponse(chunks: any[]) {
  chunks = chunks.slice(); // make a copy
  return {
    Body: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            const chunk = chunks.shift();
            if (chunk) {
              const bytes = new TextEncoder().encode('data:' + JSON.stringify(chunk));
              return Promise.resolve({
                value: { PayloadPart: { Bytes: bytes } },
                done: false,
              });
            } else {
              return Promise.resolve({ done: true });
            }
          },
        };
      },
    } as AsyncIterable<{ PayloadPart?: { Bytes?: Uint8Array } }>,
  };
}

describe('AWS SageMaker', () => {
  describe('HuggingFace', () => {
    it('should be able to parse SSE and receive the streamed response', async () => {
      const sageMakerResponse = simulateSageMakerResponse(sageMakerHuggingFaceChunks);
      const stream = AWSSageMakerHuggingFaceStream(sageMakerResponse);
      const response = new StreamingTextResponse(stream);

      expect(await readAllChunks(response)).toEqual([
        ' Hello',
        ',',
        ' world',
        '.',
      ]);
    });

    describe('StreamData protocol', () => {
      it('should send text', async () => {
        const data = new experimental_StreamData();

        const sageMakerResponse = simulateSageMakerResponse(sageMakerHuggingFaceChunks);
        const stream = AWSSageMakerHuggingFaceStream(sageMakerResponse, {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
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

        const sageMakerResponse = simulateSageMakerResponse(sageMakerHuggingFaceChunks);
        const stream = AWSSageMakerHuggingFaceStream(sageMakerResponse, {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
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
  });
});
