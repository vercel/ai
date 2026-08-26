import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertXaiResponsesUsage } from './convert-xai-responses-usage';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
];

function createModel() {
  return new XaiResponsesLanguageModel('grok-4.6', {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

function addUnknownUsageFields(usage: any) {
  return {
    ...usage,
    future_top_level_usage: { sentinel: 'top-level' },
    input_tokens_details: {
      ...usage.input_tokens_details,
      future_input_detail: { sentinel: 'input-detail' },
    },
    output_tokens_details: {
      ...usage.output_tokens_details,
      future_output_detail: { sentinel: 'output-detail' },
    },
  };
}

describe('issue #19652', () => {
  const server = createTestServer({
    'https://api.x.ai/v1/responses': {},
  });

  it('preserves complete raw usage through the JSON response schema', async () => {
    const response = JSON.parse(
      fs.readFileSync(
        'src/responses/__fixtures__/issue-19652-live-generate.json',
        'utf8',
      ),
    );
    const expectedUsage = addUnknownUsageFields(response.usage);
    response.usage = expectedUsage;

    expect(convertXaiResponsesUsage(expectedUsage).raw).toEqual(expectedUsage);

    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: response,
    };

    const result = await createModel().doGenerate({ prompt: TEST_PROMPT });

    expect(result.usage).toMatchObject({
      inputTokens: {
        total: 5165,
        noCache: 4013,
        cacheRead: 1152,
      },
      outputTokens: {
        total: 891,
        text: 31,
        reasoning: 860,
      },
    });
    expect(result.usage.raw).toEqual(expectedUsage);
  });

  it('preserves complete raw usage from the final SSE usage event', async () => {
    const event = JSON.parse(
      fs
        .readFileSync(
          'src/responses/__fixtures__/issue-19652-live-stream.chunks.txt',
          'utf8',
        )
        .trim(),
    );
    const expectedUsage = addUnknownUsageFields(event.response.usage);
    event.response.usage = expectedUsage;
    const initialEvent = {
      type: 'response.created',
      response: {
        id: 'initial-response',
        model: 'grok-4.6',
        object: 'response',
        output: [],
        status: 'in_progress',
        usage: addUnknownUsageFields({
          input_tokens: 1,
          output_tokens: 2,
          total_tokens: 3,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        }),
      },
    };

    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify(initialEvent)}\n\n`,
        `data: ${JSON.stringify(event)}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await createModel().doStream({ prompt: TEST_PROMPT });
    const parts = await convertReadableStreamToArray(stream);
    const finish = parts.find(part => part.type === 'finish');

    expect(finish).toMatchObject({
      type: 'finish',
      usage: {
        inputTokens: {
          total: 5467,
          noCache: 4315,
          cacheRead: 1152,
        },
        outputTokens: {
          total: 593,
          text: 18,
          reasoning: 575,
        },
      },
    });
    expect(finish?.usage.raw).toEqual(expectedUsage);
  });

  it('continues to reject invalid known usage fields', async () => {
    const response = JSON.parse(
      fs.readFileSync(
        'src/responses/__fixtures__/issue-19652-live-generate.json',
        'utf8',
      ),
    );
    response.usage.input_tokens = 'not-a-number';

    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'json-value',
      body: response,
    };

    await expect(
      createModel().doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toThrow();
  });
});
