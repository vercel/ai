import {
  openaiChatCompletionChunks,
  openaiFunctionCallChunks,
} from '../tests/snapshots/openai-chat';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';
import { createStreamableValue } from './create-streamable-value';

const FUNCTION_CALL_TEST_URL = DEFAULT_TEST_URL + 'mock-func-call';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: openaiChatCompletionChunks,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
    suffix: 'data: [DONE]',
  },
  {
    url: FUNCTION_CALL_TEST_URL,
    chunks: openaiFunctionCallChunks,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
    suffix: 'data: [DONE]',
  },
]);

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('rsc - createStreamableValue()', () => {
  it('should return self', async () => {
    const value = createStreamableValue(1).update(2).update(3).done(4);
    expect(value.value).toMatchInlineSnapshot(`
      {
        "curr": 4,
        "type": Symbol(ui.streamable.value),
      }
    `);
  });
});
