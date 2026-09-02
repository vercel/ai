import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PerplexityLanguageModel } from './perplexity-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const normalFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/perplexity-usage-raw-live.json', 'utf8'),
);

const streamFixtureLines = fs
  .readFileSync('src/__fixtures__/perplexity-usage-raw-live.chunks.txt', 'utf8')
  .trim()
  .split('\n');

function createModel(fetch: typeof globalThis.fetch) {
  return new PerplexityLanguageModel('sonar', {
    baseURL: 'https://api.perplexity.ai',
    headers: () => ({ authorization: 'Bearer test-token' }),
    generateId: mockId(),
    fetch,
  });
}

describe('issue #20198 reproduction', () => {
  it('preserves the complete normal provider usage object in raw usage', async () => {
    const model = createModel(async () => {
      return new Response(JSON.stringify(normalFixture), {
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.raw).toEqual(normalFixture.usage);
    expect(result.usage.inputTokens.total).toBe(6);
    expect(result.usage.outputTokens.total).toBe(1);
  });

  it('preserves the complete terminal streaming usage object', async () => {
    const model = createModel(async () => {
      return new Response(
        `${streamFixtureLines.map(line => `data: ${line}\n\n`).join('')}data: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });

    const { stream } = await model.doStream({ prompt: TEST_PROMPT });
    const parts = await convertReadableStreamToArray(stream);
    const finish = parts.find(part => part.type === 'finish');
    const terminalUsage = JSON.parse(streamFixtureLines.at(-1)!).usage;

    expect(finish?.usage.raw).toEqual(terminalUsage);
    expect(finish?.usage.inputTokens.total).toBe(6);
    expect(finish?.usage.outputTokens.total).toBe(1);
  });

  it('preserves unknown usage and cost fields while validating known fields', async () => {
    const extendedFixture = structuredClone(normalFixture);
    extendedFixture.usage.future_usage_field = { preserved: true };
    extendedFixture.usage.cost.reasoning_tokens_cost = 0.001;
    extendedFixture.usage.cost.citation_tokens_cost = 0.002;
    extendedFixture.usage.cost.search_queries_cost = 0.003;
    extendedFixture.usage.cost.future_cost_field = { preserved: true };

    const model = createModel(async () => {
      return new Response(JSON.stringify(extendedFixture), {
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.raw).toEqual(extendedFixture.usage);
  });

  it('rejects invalid values for explicitly known usage fields', async () => {
    const invalidFixture = structuredClone(normalFixture);
    invalidFixture.usage.prompt_tokens = '6';

    const model = createModel(async () => {
      return new Response(JSON.stringify(invalidFixture), {
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(model.doGenerate({ prompt: TEST_PROMPT })).rejects.toThrow();
  });
});
