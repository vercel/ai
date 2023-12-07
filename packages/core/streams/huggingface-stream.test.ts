import { HfInference } from '@huggingface/inference';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  HuggingFaceStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { huggingfaceChunks } from '../tests/snapshots/huggingface';
import { createClient } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: huggingfaceChunks,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
  },
]);

describe('HuggingFace stream', () => {
  const Hf = new HfInference();

  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse HuggingFace response and receive the streamed response', async () => {
    const stream = HuggingFaceStream(
      Hf.textGenerationStream(
        { model: 'model', inputs: '' },
        { fetch: () => fetch(DEFAULT_TEST_URL) },
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
          { fetch: () => fetch(DEFAULT_TEST_URL) },
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
          { fetch: () => fetch(DEFAULT_TEST_URL) },
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
