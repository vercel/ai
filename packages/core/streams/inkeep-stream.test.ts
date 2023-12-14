import {
  InkeepStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { InkeepContentChunks } from '../tests/snapshots/inkeep';
import { readAllChunks } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: InkeepContentChunks,
    formatChunk: chunk =>
      `event: chat_result\ndata: ${JSON.stringify(chunk)}\n\n`,
  },
]);

describe('InkeepStream', () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('should be able to parse SSE and receive the streamed response', async () => {
    const response = await fetch(DEFAULT_TEST_URL);

    const stream = InkeepStream(response);

    const responseStream = new StreamingTextResponse(stream);

    expect(await readAllChunks(responseStream)).toEqual([
      ' Hello',
      ',',
      ' world',
      '.',
    ]);
  });

  describe('StreamData protocol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const response = await fetch(DEFAULT_TEST_URL);

      const stream = InkeepStream(response, {
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const responseStream = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(responseStream)).toEqual([
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });

    it('should send text and data', async () => {
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const response = await fetch(DEFAULT_TEST_URL);

      const stream = InkeepStream(response, {
        onFinal() {
          data.close();
        },
        experimental_streamData: true,
      });

      const responseStream = new StreamingTextResponse(stream, {}, data);

      expect(await readAllChunks(responseStream)).toEqual([
        '2:[{"t1":"v1"}]\n',
        '0:" Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ]);
    });
  });
});
