import { ReplicateStream, StreamingTextResponse } from '.';
import { createClient } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

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
});
