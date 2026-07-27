import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogle } from '../google-provider';

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));

const TEST_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] },
];

const provider = createGoogle({
  apiKey: 'test-api-key',
  generateId: () => 'test-id',
});

const options = [
  { option: 'topK', wireField: 'top_k', value: 10 },
  {
    option: 'presencePenalty',
    wireField: 'presence_penalty',
    value: 0.5,
  },
  {
    option: 'frequencyPenalty',
    wireField: 'frequency_penalty',
    value: 0.5,
  },
] as const;

function warningMentions(warnings: unknown, option: string) {
  return JSON.stringify(warnings).includes(option);
}

describe('issue #17937: interactions generation config', () => {
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

  it('does not silently drop model generation options', async () => {
    const result = await provider.interactions('gemini-2.5-flash').doGenerate({
      prompt: TEST_PROMPT,
      temperature: 0.5,
      topK: 10,
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
    });

    const body = (await server.calls[0].requestBodyJson) as {
      generation_config?: Record<string, unknown>;
    };

    const silentlyDropped = options
      .filter(
        ({ option, wireField, value }) =>
          body.generation_config?.[wireField] !== value &&
          !warningMentions(result.warnings, option),
      )
      .map(({ option }) => option);

    expect(silentlyDropped).toEqual([]);
  });

  it('includes every dropped option in the agent warning', async () => {
    const result = await provider
      .interactions({ agent: 'antigravity-preview-05-2026' })
      .doGenerate({
        prompt: TEST_PROMPT,
        topK: 10,
        presencePenalty: 0.5,
        frequencyPenalty: 0.5,
      });

    const body = (await server.calls[0].requestBodyJson) as {
      generation_config?: Record<string, unknown>;
    };
    expect(body.generation_config).toBeUndefined();

    const silentlyDropped = options
      .filter(({ option }) => !warningMentions(result.warnings, option))
      .map(({ option }) => option);

    expect(silentlyDropped).toEqual([]);
  });
});
