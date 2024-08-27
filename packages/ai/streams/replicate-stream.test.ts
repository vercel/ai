import { ReplicateStream, StreamingTextResponse, StreamData } from '.';
import { replicateTextChunks } from '../tests/snapshots/replicate';
import { readAllChunks } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: replicateTextChunks,
    formatChunk: chunk => chunk,
  },
]);

describe('ReplicateStream', () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('should send text', async () => {
    const data = new StreamData();

    const stream = await ReplicateStream(
      {
        id: 'fake',
        status: 'processing',
        version: 'fake',
        input: {},
        source: 'api',
        created_at: 'fake',
        urls: { get: '', cancel: '', stream: DEFAULT_TEST_URL },
      },
      {
        onFinal() {
          data.close();
        },
      },
    );

    const response = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(response)).toEqual([
      '0:" Hello,"\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });

  it('should send text and data', async () => {
    const data = new StreamData();

    data.append({ t1: 'v1' });

    const stream = await ReplicateStream(
      {
        id: 'fake',
        status: 'processing',
        version: 'fake',
        input: {},
        source: 'api',
        created_at: 'fake',
        urls: { get: '', cancel: '', stream: DEFAULT_TEST_URL },
      },
      {
        onFinal() {
          data.close();
        },
      },
    );

    const response = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(response)).toEqual([
      '2:[{"t1":"v1"}]\n',
      '0:" Hello,"\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });
});
