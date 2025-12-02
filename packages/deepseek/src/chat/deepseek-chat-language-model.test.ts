import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { DeepSeekChatOptions } from './deepseek-chat-options';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createDeepSeek({
  apiKey: 'test-api-key',
});

const server = createTestServer({
  'https://api.deepseek.com/v1/chat/completions': {},
});

describe('DeepSeekChatLanguageModel', () => {
  describe('doGenerate', () => {
    function prepareJsonFixtureResponse(filename: string) {
      server.urls['https://api.deepseek.com/v1/chat/completions'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(`src/chat/__fixtures__/${filename}.json`, 'utf8'),
        ),
      };
      return;
    }

    describe('text', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-text');
      });

      it('should send model id, settings, and input', async () => {
        await provider.chat('deepseek-chat').doGenerate({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "You are a helpful assistant.",
                "role": "system",
              },
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "deepseek-chat",
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);
      });

      it('should extract text content', async () => {
        const result = await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result).toMatchSnapshot();
      });
    });

    describe('reasoning', () => {
      beforeEach(() => {
        prepareJsonFixtureResponse('deepseek-reasoning');
      });

      it('should send model id, settings, and input', async () => {
        await provider.chat('deepseek-reasoner').doGenerate({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'How many "r"s are in the word "strawberry"?',
                },
              ],
            },
          ],
          providerOptions: {
            deepseek: {
              thinking: { type: 'enabled' },
            } satisfies DeepSeekChatOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "How many "r"s are in the word "strawberry"?",
                "role": "user",
              },
            ],
            "model": "deepseek-reasoner",
            "thinking": {
              "type": "enabled",
            },
          }
        `);
      });

      it('should extract text content', async () => {
        const result = await provider.chat('deepseek-chat').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result).toMatchSnapshot();
      });
    });
  });

  describe('doStream', () => {
    function prepareChunksFixtureResponse(filename: string) {
      const chunks = fs
        .readFileSync(`src/chat/__fixtures__/${filename}.chunks.txt`, 'utf8')
        .split('\n')
        .map(line => `data: ${line}\n\n`);
      chunks.push('data: [DONE]\n\n');

      server.urls['https://api.deepseek.com/v1/chat/completions'].response = {
        type: 'stream-chunks',
        chunks,
      };
    }

    describe('text', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('deepseek-text');
      });

      it('should send model id, settings, and input', async () => {
        await provider.chat('deepseek-chat').doStream({
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
          temperature: 0.5,
          topP: 0.3,
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "messages": [
              {
                "content": "You are a helpful assistant.",
                "role": "system",
              },
              {
                "content": "Hello",
                "role": "user",
              },
            ],
            "model": "deepseek-chat",
            "stream": true,
            "stream_options": {
              "include_usage": true,
            },
            "temperature": 0.5,
            "top_p": 0.3,
          }
        `);
      });

      it('should stream text', async () => {
        const result = await provider.chat('deepseek-chat').doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });

    describe('reasoning', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('deepseek-reasoning');
      });

      it('should stream reasoning', async () => {
        const result = await provider.chat('deepseek-reasoning').doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });
  });
});
