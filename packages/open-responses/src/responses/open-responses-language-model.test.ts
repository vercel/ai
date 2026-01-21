import {
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { OpenResponsesLanguageModel } from './open-responses-language-model';

describe('OpenResponsesLanguageModel', () => {
  const TEST_PROMPT: LanguageModelV3Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  const URL = 'https://localhost:1234/v1/responses';

  const server = createTestServer({
    [URL]: {},
  });

  function createModel(modelId: string = 'gemma-7b-it') {
    return new OpenResponsesLanguageModel(modelId, {
      provider: 'lmstudio',
      url: URL,
      headers: () => ({}),
      generateId: mockId(),
    });
  }

  describe('doGenerate', () => {
    function prepareJsonFixtureResponse(filename: string) {
      server.urls[URL].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(
            `src/responses/__fixtures__/${filename}.json`,
            'utf8',
          ),
        ),
      };
      return;
    }

    describe('basic generation', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
        });
      });

      it('should send correct request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });

      it('should produce correct content', async () => {
        expect(result.content).toMatchSnapshot();
      });

      it('should extract usage correctly', async () => {
        expect(result.usage).toMatchSnapshot();
      });
    });

    describe('request parameters', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          maxOutputTokens: 100,
          temperature: 0.5,
        });
      });

      it('should send correct request body', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });

    describe('tools', () => {
      let result: LanguageModelV3GenerateResult;

      beforeEach(async () => {
        prepareJsonFixtureResponse('lmstudio-basic.1');

        result = await createModel().doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the current weather for a location',
              inputSchema: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state',
                  },
                },
                required: ['location'],
              },
            },
            {
              type: 'function',
              name: 'search',
              description: 'Search for information',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                  },
                },
                required: ['query'],
              },
              strict: true,
            },
          ],
        });
      });

      it('should send correct request body with tools', async () => {
        expect(await server.calls[0].requestBodyJson).toMatchSnapshot();
      });
    });
  });

  describe('doStream', () => {
    function prepareChunksFixtureResponse(filename: string) {
      const chunks = fs
        .readFileSync(
          `src/responses/__fixtures__/${filename}.chunks.txt`,
          'utf8',
        )
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => `data: ${line}\n\n`);
      chunks.push('data: [DONE]\n\n');

      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks,
      };
    }

    describe('basic generation', () => {
      it('should stream content', async () => {
        prepareChunksFixtureResponse('lmstudio-basic.1');

        const result = await createModel().doStream({
          prompt: TEST_PROMPT,
        });

        expect(
          await convertReadableStreamToArray(result.stream),
        ).toMatchSnapshot();
      });
    });
  });
});
