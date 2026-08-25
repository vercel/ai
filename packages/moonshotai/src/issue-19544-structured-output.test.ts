import type { JSONSchema7, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
    },
  },
  required: ['pair'],
  additionalProperties: false,
};

const normalizedSchema = {
  type: 'object',
  properties: {
    pair: {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    },
  },
  required: ['pair'],
  additionalProperties: false,
} as const;

const server = createTestServer({
  'https://api.moonshot.ai/v1/chat/completions': {},
});

const provider = createMoonshotAI({
  apiKey: 'test-api-key',
});

describe('issue #19544 structured output request', () => {
  beforeEach(() => {
    server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/moonshotai-issue-19544-accepted.json',
          'utf8',
        ),
      ),
    };
  });

  it('normalizes nested schemas, defaults strict to true, and omits description', async () => {
    await provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        name: 'tuple_response',
        description: 'A named pair.',
        schema,
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.response_format).toStrictEqual({
      type: 'json_schema',
      json_schema: {
        name: 'tuple_response',
        strict: true,
        schema: normalizedSchema,
      },
    });
  });

  it('supports strictJsonSchema false', async () => {
    await provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        name: 'tuple_response',
        schema,
      },
      providerOptions: {
        moonshotai: {
          strictJsonSchema: false,
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.response_format.json_schema.strict).toBe(false);
  });

  it('keeps JSON-object fallback unchanged', async () => {
    await provider.chatModel('moonshot-v1-8k').doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        schema,
      },
      providerOptions: {
        moonshotai: {
          strictJsonSchema: false,
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.response_format).toStrictEqual({
      type: 'json_object',
    });
  });
});
