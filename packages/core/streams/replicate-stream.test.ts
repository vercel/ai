import {
  ReplicateStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('ReplicateStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3034);
  });
  afterAll(async () => server.teardown());

  function readAllChunks(response: Response) {
    return createClient(response).readAll();
  }

  it('should be able to parse SSE and receive the streamed response', async () => {
    // Note: this only tests the streaming response from Replicate, not the framework invocation.

    const stream = await ReplicateStream(
      {
        id: 'fake',
        status: 'processing',
        version: 'fake',
        input: {},
        source: 'api',
        created_at: 'fake',
        urls: { get: '', cancel: '', stream: server.api },
      },
      undefined,
      {
        headers: { 'x-mock-service': 'replicate', 'x-mock-type': 'chat' },
      },
    );

    const response = new StreamingTextResponse(stream);

    expect(await readAllChunks(response)).toEqual([' Hello,', ' world', '.']);
  });

  describe('StreamData protocol', () => {
    it('should send text', async () => {
      const data = new experimental_StreamData();

      const stream = await ReplicateStream(
        {
          id: 'fake',
          status: 'processing',
          version: 'fake',
          input: {},
          source: 'api',
          created_at: 'fake',
          urls: { get: '', cancel: '', stream: server.api },
        },
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
        {
          headers: { 'x-mock-service': 'replicate', 'x-mock-type': 'chat' },
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
      const data = new experimental_StreamData();

      data.append({ t1: 'v1' });

      const stream = await ReplicateStream(
        {
          id: 'fake',
          status: 'processing',
          version: 'fake',
          input: {},
          source: 'api',
          created_at: 'fake',
          urls: { get: '', cancel: '', stream: server.api },
        },
        {
          onFinal() {
            data.close();
          },
          experimental_streamData: true,
        },
        {
          headers: { 'x-mock-service': 'replicate', 'x-mock-type': 'chat' },
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
});
