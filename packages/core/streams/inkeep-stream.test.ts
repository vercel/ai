import {
  InkeepOnFinalMetadata,
  InkeepStream,
  StreamingTextResponse,
  StreamData,
} from '.';
import { InkeepEventStream } from '../tests/snapshots/inkeep';
import { readAllChunks } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: InkeepEventStream,
    formatChunk: ({ event, data }) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
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

  const recordsCitedSerialized =
    '"records_cited":{"citations":[{"number":1,"record":{"url":"https://inkeep.com","title":"Inkeep","breadcrumbs":["Home","About"]}}]}';

  it('should receive and send Inkeep onFinal metadata with chat_session_id', async () => {
    const data = new StreamData();

    const response = await fetch(DEFAULT_TEST_URL);

    const stream = InkeepStream(response, {
      onFinal: async (complete: string, metadata?: InkeepOnFinalMetadata) => {
        // return the chat_session_id to the client
        if (metadata) {
          data.append({ onFinalMetadata: metadata });
        }
        data.close();
      },
    });

    const responseStream = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(responseStream)).toEqual([
      '0:" Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
      `2:[{"onFinalMetadata":{"chat_session_id":"12345",${recordsCitedSerialized}}}]\n`,
    ]);
  });

  it('should receive and send Inkeep records_cited data as message annotation', async () => {
    const data = new StreamData();

    const response = await fetch(DEFAULT_TEST_URL);

    const stream = InkeepStream(response, {
      onRecordsCited: async records_cited => {
        // append the citations to the message annotations
        data.appendMessageAnnotation({
          records_cited,
        });
      },
      onFinal: async (complete: string, metadata?: InkeepOnFinalMetadata) => {
        // return the chat_session_id to the client
        if (metadata) {
          data.append({ onFinalMetadata: metadata });
        }
        data.close();
      },
    });

    const responseStream = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(responseStream)).toEqual([
      '0:" Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
      `2:[{"onFinalMetadata":{"chat_session_id":"12345",${recordsCitedSerialized}}}]\n`,
      `8:[{${recordsCitedSerialized}}]\n`,
    ]);
  });
});
