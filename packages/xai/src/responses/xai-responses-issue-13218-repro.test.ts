import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { XaiResponsesLanguageModel } from './xai-responses-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'what is xAI?' }] },
];

function createModel() {
  return new XaiResponsesLanguageModel('grok-4-fast-non-reasoning', {
    provider: 'xai.responses',
    baseURL: 'https://api.x.ai/v1',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    generateId: mockId(),
  });
}

describe('issue #13218 reproduction', () => {
  const server = createTestServer({
    'https://api.x.ai/v1/responses': {},
  });

  function prepareStreamChunks(chunks: unknown[]) {
    server.urls['https://api.x.ai/v1/responses'].response = {
      type: 'stream-chunks',
      chunks: chunks
        .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
        .concat('data: [DONE]\n\n'),
    };
  }

  it('emits a tool-result when a provider-executed web_search_call completes', async () => {
    prepareStreamChunks([
      {
        type: 'response.created',
        response: {
          id: 'resp_13218',
          object: 'response',
          model: 'grok-4-fast-non-reasoning',
          status: 'in_progress',
          output: [],
        },
      },
      {
        type: 'response.output_item.added',
        item: {
          type: 'web_search_call',
          id: 'ws_13218',
          name: 'web_search',
          arguments: '{"query":"what is xAI","num_results":5}',
          call_id: '',
          status: 'in_progress',
        },
        output_index: 0,
      },
      {
        type: 'response.web_search_call.completed',
        item_id: 'ws_13218',
        output_index: 0,
      },
      {
        type: 'response.output_item.done',
        item: {
          type: 'web_search_call',
          id: 'ws_13218',
          name: 'web_search',
          arguments: '{"query":"what is xAI","num_results":5}',
          call_id: '',
          status: 'completed',
        },
        output_index: 0,
      },
      {
        type: 'response.done',
        response: {
          id: 'resp_13218',
          object: 'response',
          model: 'grok-4-fast-non-reasoning',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
        },
      },
    ]);

    const { stream } = await createModel().doStream({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'xai.web_search',
          name: 'web_search',
          args: {},
        },
      ],
    });

    const parts = await convertReadableStreamToArray(stream);

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'ws_13218',
      toolName: 'web_search',
      input: '{"query":"what is xAI","num_results":5}',
      providerExecuted: true,
    });

    // This is the behavior requested in #13218. It currently fails:
    // web_search_call completion emits no tool-result, so UI streams never
    // receive the corresponding tool-output-available chunk.
    expect(parts).toContainEqual({
      type: 'tool-result',
      toolCallId: 'ws_13218',
      toolName: 'web_search',
      result: {},
    });
  });
});
