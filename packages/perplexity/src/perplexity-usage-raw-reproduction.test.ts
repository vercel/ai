import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PerplexityLanguageModel } from './perplexity-language-model';

const CHAT_COMPLETIONS_URL = 'https://api.perplexity.ai/chat/completions';
const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const server = createTestServer({ [CHAT_COMPLETIONS_URL]: {} });
const model = new PerplexityLanguageModel('sonar', {
  baseURL: 'https://api.perplexity.ai',
  headers: () => ({ authorization: 'Bearer test-token' }),
  generateId: () => 'test-id',
});

function readNormalFixture() {
  return JSON.parse(
    fs.readFileSync('src/__fixtures__/perplexity-usage-raw-live.json', 'utf8'),
  );
}

function readStreamFixture() {
  return fs
    .readFileSync(
      'src/__fixtures__/perplexity-usage-raw-live.chunks.txt',
      'utf8',
    )
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line));
}

describe('Perplexity raw usage reproduction', () => {
  it('preserves complete normal usage while keeping normalized accounting unchanged', async () => {
    const body = readNormalFixture();
    body.usage.unknown_usage_field = 'top-level-sentinel';
    body.usage.cost = {
      ...body.usage.cost,
      reasoning_tokens_cost: 0.001,
      citation_tokens_cost: 0.002,
      search_queries_cost: 0.003,
      unknown_cost_field: 'nested-sentinel',
    };
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body,
    };

    const result = await model.doGenerate({ prompt });

    expect(result.usage.raw).toEqual(body.usage);
    expect(result.usage.inputTokens.total).toBe(5);
    expect(result.usage.outputTokens).toEqual({
      total: 1,
      text: 1,
      reasoning: 0,
    });
  });

  it('uses and preserves the complete terminal streaming usage object', async () => {
    const chunks = readStreamFixture();
    chunks[0].usage.fragment_sentinel = 'non-terminal';
    chunks[1].usage.fragment_sentinel = 'terminal';
    chunks[1].usage.cost = {
      ...chunks[1].usage.cost,
      reasoning_tokens_cost: 0.001,
      citation_tokens_cost: 0.002,
      search_queries_cost: 0.003,
      unknown_cost_field: 'nested-terminal-sentinel',
    };
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'stream-chunks',
      chunks: [
        ...chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
        'data: [DONE]\n\n',
      ],
    };

    const result = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(result.stream);
    const finish = parts.find(part => part.type === 'finish');

    expect(finish?.usage.raw).toEqual(chunks[1].usage);
    expect(finish?.usage.inputTokens.total).toBe(5);
    expect(finish?.usage.outputTokens).toEqual({
      total: 1,
      text: 1,
      reasoning: 0,
    });
  });

  it.each([
    ['search_context_size', 123],
    ['reasoning_tokens_cost', 'invalid'],
    ['citation_tokens_cost', 'invalid'],
    ['search_queries_cost', 'invalid'],
  ])('rejects invalid documented usage field %s', async (field, value) => {
    const body = readNormalFixture();
    if (field === 'search_context_size') {
      body.usage[field] = value;
    } else {
      body.usage.cost[field] = value;
    }
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body,
    };

    await expect(model.doGenerate({ prompt })).rejects.toBeDefined();
  });
});
