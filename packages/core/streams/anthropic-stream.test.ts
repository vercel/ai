import Anthropic from '@anthropic-ai/sdk';
import { AnthropicStream, StreamingTextResponse, StreamData } from '.';
import {
  anthropicMessageChunks,
  anthropicCompletionChunks,
} from '../tests/snapshots/anthropic';
import { readAllChunks } from '../tests/utils/mock-client';
import { DEFAULT_TEST_URL, createMockServer } from '../tests/utils/mock-server';

export const MESSAGE_URL = 'http://localhost:3030/messages';

const server = createMockServer([
  {
    url: DEFAULT_TEST_URL,
    chunks: anthropicCompletionChunks,
    formatChunk: chunk =>
      `event: completion\ndata: ${JSON.stringify(chunk)}\n\n`,
  },
  {
    url: MESSAGE_URL,
    chunks: anthropicMessageChunks,
    formatChunk: chunk => chunk,
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

describe('Anthropic completion', () => {
  it('should send text', async () => {
    const anthropic = new Anthropic({
      fetch: () => fetch(DEFAULT_TEST_URL),
      apiKey: 'sk-doesnt-matter',
    });

    const data = new StreamData();

    const anthropicResponse = await anthropic.completions.create({
      prompt: '',
      model: 'claude-2',
      stream: true,
      max_tokens_to_sample: 300,
    });

    const stream = AnthropicStream(anthropicResponse, {
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
    const anthropic = new Anthropic({
      fetch: () => fetch(DEFAULT_TEST_URL),
      apiKey: 'sk-doesnt-matter',
    });

    const data = new StreamData();

    data.append({ t1: 'v1' });

    const anthropicResponse = await anthropic.completions.create({
      prompt: '',
      model: 'claude-2',
      stream: true,
      max_tokens_to_sample: 300,
    });

    const stream = AnthropicStream(anthropicResponse, {
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

describe('Anthropic message', () => {
  it('should send text', async () => {
    const anthropic = new Anthropic({
      fetch: () => fetch(MESSAGE_URL),
      apiKey: 'sk-doesnt-matter',
    });

    const data = new StreamData();

    const anthropicResponse = await anthropic.messages.create({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'claude-2.1',
      stream: true,
      max_tokens: 300,
    });

    const stream = AnthropicStream(anthropicResponse, {
      onFinal() {
        data.close();
      },
    });

    const response = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(response)).toEqual([
      '0:"Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });

  it('should send text and data', async () => {
    const anthropic = new Anthropic({
      fetch: () => fetch(MESSAGE_URL),
      apiKey: 'sk-doesnt-matter',
    });

    const data = new StreamData();

    data.append({ t1: 'v1' });

    const anthropicResponse = await anthropic.messages.create({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'claude-2.1',
      stream: true,
      max_tokens: 300,
    });

    const stream = AnthropicStream(anthropicResponse, {
      onFinal() {
        data.close();
      },
    });

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
