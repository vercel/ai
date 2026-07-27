import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleGenerativeAI } from '../google-provider';

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));

const TEST_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] },
];

const provider = createGoogleGenerativeAI({
  apiKey: 'test-api-key',
  generateId: () => 'test-id',
});

describe('issue #17937: interactions generation options', () => {
  const server = createTestServer({ [TEST_URL]: {} });

  beforeEach(() => {
    server.urls[TEST_URL].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/interactions/__fixtures__/issue-17937-top-k.json',
          'utf8',
        ),
      ),
    };
  });

  it('forwards supported topK and warns for unsupported penalties on model calls', async () => {
    const result = await provider.interactions('gemini-2.5-flash').doGenerate({
      prompt: TEST_PROMPT,
      temperature: 0.5,
      topK: 10,
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
    });

    const body = await server.calls[0].requestBodyJson;

    expect(body.generation_config).toMatchObject({
      temperature: 0.5,
      top_k: 10,
    });
    expect(result.warnings).toEqual([
      { type: 'unsupported', feature: 'presencePenalty' },
      { type: 'unsupported', feature: 'frequencyPenalty' },
    ]);
  });

  it('warns when all three options are dropped from agent calls', async () => {
    const result = await provider
      .interactions({ agent: 'deep-research-pro-preview-12-2025' })
      .doGenerate({
        prompt: TEST_PROMPT,
        topK: 10,
        presencePenalty: 0.5,
        frequencyPenalty: 0.5,
      });

    const body = await server.calls[0].requestBodyJson;
    const warnings = JSON.stringify(result.warnings);

    expect(body.generation_config).toBeUndefined();
    expect(warnings).toContain('topK');
    expect(warnings).toContain('presencePenalty');
    expect(warnings).toContain('frequencyPenalty');
  });
});
