import Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AnthropicStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { readAllChunks } from '../tests/utils/mock-client';
import { setup } from '../tests/utils/mock-service';

describe('AnthropicStream', () => {
  let server: ReturnType<typeof setup>;
  beforeAll(() => {
    server = setup(3035);
  });
  afterAll(async () => server.teardown());

  it('should be able to parse SSE and receive the streamed response', async () => {
    const anthropic = new Anthropic({
      fetch: () =>
        fetch(server.api, {
          headers: {
            'x-mock-service': 'anthropic',
            'x-mock-type': 'chat',
          },
        }),
      apiKey: 'sk-doesnt-matter',
    });

    const anthropicResponse = await anthropic.completions.create({
      prompt: '',
      model: 'claude-2',
      stream: true,
      max_tokens_to_sample: 300,
    });

    const stream = AnthropicStream(anthropicResponse);

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
      const anthropic = new Anthropic({
        fetch: () =>
          fetch(server.api, {
            headers: {
              'x-mock-service': 'anthropic',
              'x-mock-type': 'chat',
            },
          }),
        apiKey: 'sk-doesnt-matter',
      });

      const data = new experimental_StreamData();

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
      const anthropic = new Anthropic({
        fetch: () =>
          fetch(server.api, {
            headers: {
              'x-mock-service': 'anthropic',
              'x-mock-type': 'chat',
            },
          }),
        apiKey: 'sk-doesnt-matter',
      });

      const data = new experimental_StreamData();

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
