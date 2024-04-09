import MistralClient from '@mistralai/mistralai';
import { StreamingTextResponse, StreamData } from '.';
import { mistralChunks } from '../tests/snapshots/mistral';
import { readAllChunks } from '../tests/utils/mock-client';
import { createMockServer } from '../tests/utils/mock-server';
import { MistralStream } from './mistral-stream';

const server = createMockServer([
  {
    url: 'http://localhost:3030/v1/chat/completions',
    chunks: mistralChunks,
    formatChunk: chunk => `data: ${JSON.stringify(chunk)}\n\n`,
    suffix: 'data: [DONE]',
  },
]);

describe('MistralStream', () => {
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

    const client = new MistralClient('api-key', 'http://localhost:3030');

    const mistralResponse = client.chatStream({
      model: 'mistral-small',
      messages: [{ role: 'user', content: 'What is the best French cheese?' }],
    });

    const stream = MistralStream(mistralResponse, {
      onFinal() {
        data.close();
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const chunks = await readAllChunks(response);

    expect(chunks).toEqual([
      '0:"Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });

  it('should send text and data', async () => {
    const data = new StreamData();

    data.append({ t1: 'v1' });

    const client = new MistralClient('api-key', 'http://localhost:3030');

    const mistralResponse = client.chatStream({
      model: 'mistral-small',
      messages: [{ role: 'user', content: 'What is the best French cheese?' }],
    });

    const stream = MistralStream(mistralResponse, {
      onFinal() {
        data.close();
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    const chunks = await readAllChunks(response);

    expect(chunks).toEqual([
      '2:[{"t1":"v1"}]\n',
      '0:"Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });
});
