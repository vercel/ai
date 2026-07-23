import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

describe('forward-compatible Anthropic defaults', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

  const provider = createAnthropic({ apiKey: 'test-api-key' });

  beforeEach(() => {
    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/anthropic-forward-compatible-control.json',
          'utf8',
        ),
      ),
    };
  });

  it('uses current-generation defaults and retains the warning for an unknown Claude ID', async () => {
    const result = await provider('claude-future-9').doGenerate({
      prompt: TEST_PROMPT,
      temperature: 0.5,
      topK: 20,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
    });

    const request = await server.calls[0].requestBodyJson;

    expect(request.max_tokens).toBe(128000);
    expect(request.output_config?.format).toBeDefined();
    expect(request.tools).toBeUndefined();
    expect(request.temperature).toBeUndefined();
    expect(request.top_k).toBeUndefined();
    expect(result.warnings).toContainEqual({
      type: 'compatibility',
      feature: 'maxOutputTokens',
      details:
        'The model "claude-future-9" is unknown. The max output tokens have been limited to 128000. Set maxOutputTokens explicitly to override this limit.',
    });
  });

  it('matches a platform-prefixed unknown Claude ID', async () => {
    await provider('us.anthropic.claude-future-9-20990101-v1:0').doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      max_tokens: 128000,
    });
  });

  it('keeps conservative defaults for an unknown non-Claude ID', async () => {
    await provider('third-party-future-model').doGenerate({
      prompt: TEST_PROMPT,
      temperature: 0.5,
      topK: 20,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
    });

    const request = await server.calls[0].requestBodyJson;

    expect(request.max_tokens).toBe(4096);
    expect(request.output_config).toBeUndefined();
    expect(request.tools).toBeDefined();
    expect(request.temperature).toBe(0.5);
    expect(request.top_k).toBe(20);
  });
});
