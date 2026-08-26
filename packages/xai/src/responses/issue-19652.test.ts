import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
];

const jsonFixture = JSON.parse(
  fs.readFileSync(
    'src/responses/__fixtures__/xai-image-generation-tool.1.json',
    'utf8',
  ),
);
const chunkFixture = fs
  .readFileSync(
    'src/responses/__fixtures__/xai-image-generation-tool.1.chunks.txt',
    'utf8',
  )
  .trim()
  .split('\n')
  .map(line => {
    const event = JSON.parse(line);
    if (event.response?.usage != null) {
      addUnknownUsageFields(event.response.usage);
    }
    return JSON.stringify(event);
  });

function addUnknownUsageFields(usage: {
  input_tokens_details: Record<string, unknown>;
  output_tokens_details: Record<string, unknown>;
  [key: string]: unknown;
}) {
  usage.input_tokens_details.provider_input_sentinel = { preserved: true };
  usage.output_tokens_details.provider_output_sentinel = ['preserve', 1];
  usage.provider_top_level_sentinel = { preserved: true };
}

addUnknownUsageFields(jsonFixture.usage);

function createModel() {
  return new XaiResponsesLanguageModel('grok-4-fast-non-reasoning', {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

describe('issue #19652', () => {
  const server = createTestServer({
    'https://api.x.ai/v1/responses': {},
  });

  it('preserves complete raw usage through doGenerate parsing', async () => {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: jsonFixture,
    };

    const result = await createModel().doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage.raw).toStrictEqual(jsonFixture.usage);
    expect(result.usage.inputTokens).toStrictEqual({
      total: 100,
      noCache: 80,
      cacheRead: 20,
      cacheWrite: undefined,
    });
    expect(result.usage.outputTokens).toStrictEqual({
      total: 50,
      text: 20,
      reasoning: 30,
    });
  });

  it('preserves complete raw usage from the final doStream usage event', async () => {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: chunkFixture
        .map(line => `data: ${line}\n\n`)
        .concat('data: [DONE]\n\n'),
    };

    const { stream } = await createModel().doStream({ prompt: TEST_PROMPT });
    const parts = await convertReadableStreamToArray(stream);
    const finishPart = parts.find(part => part.type === 'finish');

    expect(finishPart).toBeDefined();
    if (finishPart?.type !== 'finish') {
      throw new Error('finish part missing');
    }

    expect(finishPart.usage.raw).toStrictEqual(jsonFixture.usage);
    expect(finishPart.usage.inputTokens).toStrictEqual({
      total: 100,
      noCache: 80,
      cacheRead: 20,
      cacheWrite: undefined,
    });
    expect(finishPart.usage.outputTokens).toStrictEqual({
      total: 50,
      text: 20,
      reasoning: 30,
    });
  });

  it('continues validating known usage field types', async () => {
    const invalidFixture = structuredClone(jsonFixture);
    invalidFixture.usage.input_tokens = '100';
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: invalidFixture,
    };

    await expect(
      createModel().doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow();
  });
});
