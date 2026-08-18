import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { PerplexityAgentLanguageModel } from './perplexity-agent-language-model';

const AGENT_URL = 'https://api.perplexity.ai/v1/agent';
const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'What is new in AI?' }] },
];

const server = createTestServer({ [AGENT_URL]: {} });

function createModel(modelId = 'openai/gpt-5-mini') {
  return new PerplexityAgentLanguageModel(modelId, {
    baseURL: 'https://api.perplexity.ai',
    headers: () => ({ authorization: 'Bearer test-token' }),
    generateId: mockId(),
  });
}

function prepareResponse() {
  server.urls[AGENT_URL].response = {
    type: 'json-value',
    body: {
      id: 'resp-1',
      object: 'response',
      created_at: 1770000000,
      status: 'completed',
      model: 'openai/gpt-5-mini',
      output: [
        {
          type: 'search_results',
          queries: ['new AI'],
          results: [
            {
              id: 1,
              url: 'https://example.com/ai',
              title: 'AI update',
              snippet: 'An update.',
              source: 'web',
            },
          ],
        },
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'AI is advancing.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://example.com/ai',
                  title: 'AI update',
                  start_index: 0,
                  end_index: 2,
                },
              ],
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        input_tokens_details: {
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
        },
        tool_calls_details: { web_search: { invocation: 1 } },
        cost: {
          currency: 'USD',
          input_cost: 0.001,
          output_cost: 0.002,
          total_cost: 0.008,
          tool_calls_cost: 0.005,
        },
      },
    },
  };
}

describe('PerplexityAgentLanguageModel', () => {
  it('sends Agent API requests with built-in tools and provider options', async () => {
    prepareResponse();

    await createModel().doGenerate({
      prompt: [{ role: 'system', content: 'Be concise.' }, ...TEST_PROMPT],
      maxOutputTokens: 100,
      reasoning: 'high',
      providerOptions: {
        perplexity: {
          max_steps: 4,
          language_preference: 'en',
        },
      },
      tools: [
        {
          type: 'provider',
          id: 'perplexity.web_search',
          name: 'web_search',
          args: {
            filters: { searchDomainFilter: ['example.com'] },
            searchContextSize: 'low',
          },
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "input": [
          {
            "content": [
              {
                "text": "What is new in AI?",
                "type": "input_text",
              },
            ],
            "role": "user",
            "type": "message",
          },
        ],
        "instructions": "Be concise.",
        "language_preference": "en",
        "max_output_tokens": 100,
        "max_steps": 4,
        "model": "openai/gpt-5-mini",
        "reasoning": {
          "effort": "high",
        },
        "tools": [
          {
            "filters": {
              "search_domain_filter": [
                "example.com",
              ],
            },
            "search_context_size": "low",
            "type": "web_search",
          },
        ],
      }
    `);
  });

  it('uses Agent API presets', async () => {
    prepareResponse();

    await createModel('low').doGenerate({ prompt: TEST_PROMPT });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "input": [
          {
            "content": [
              {
                "text": "What is new in AI?",
                "type": "input_text",
              },
            ],
            "role": "user",
            "type": "message",
          },
        ],
        "preset": "low",
      }
    `);
  });

  it('maps text, search results, sources, usage, output, and cost', async () => {
    prepareResponse();

    const result = await createModel().doGenerate({ prompt: TEST_PROMPT });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "kind": "perplexity.search_results",
          "providerMetadata": {
            "perplexity": {
              "output": {
                "queries": [
                  "new AI",
                ],
                "results": [
                  {
                    "id": 1,
                    "snippet": "An update.",
                    "source": "web",
                    "title": "AI update",
                    "url": "https://example.com/ai",
                  },
                ],
                "type": "search_results",
              },
            },
          },
          "type": "custom",
        },
        {
          "providerMetadata": {
            "perplexity": {
              "annotations": [
                {
                  "end_index": 2,
                  "start_index": 0,
                  "title": "AI update",
                  "type": "url_citation",
                  "url": "https://example.com/ai",
                },
              ],
              "itemId": "msg-1",
            },
          },
          "text": "AI is advancing.",
          "type": "text",
        },
        {
          "id": "id-0",
          "providerMetadata": {
            "perplexity": {
              "date": null,
              "lastUpdated": null,
              "snippet": "An update.",
              "source": "web",
              "sourceType": "search_results",
            },
          },
          "sourceType": "url",
          "title": "AI update",
          "type": "source",
          "url": "https://example.com/ai",
        },
      ]
    `);
    expect(result.usage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 3,
          "cacheWrite": 2,
          "noCache": 5,
          "total": 10,
        },
        "outputTokens": {
          "reasoning": undefined,
          "text": 5,
          "total": 5,
        },
        "raw": {
          "cost": {
            "currency": "USD",
            "input_cost": 0.001,
            "output_cost": 0.002,
            "tool_calls_cost": 0.005,
            "total_cost": 0.008,
          },
          "input_tokens": 10,
          "input_tokens_details": {
            "cache_creation_input_tokens": 2,
            "cache_read_input_tokens": 3,
          },
          "output_tokens": 5,
          "tool_calls_details": {
            "web_search": {
              "invocation": 1,
            },
          },
          "total_tokens": 15,
        },
      }
    `);
    expect(result.providerMetadata?.perplexity.cost).toMatchInlineSnapshot(`
      {
        "cacheCreationCost": null,
        "cacheReadCost": null,
        "currency": "USD",
        "inputCost": 0.001,
        "outputCost": 0.002,
        "toolCallsCost": 0.005,
        "totalCost": 0.008,
      }
    `);
  });

  it('streams reasoning, text, sources, raw chunks, and final metadata', async () => {
    const finalResponse = {
      id: 'resp-1',
      object: 'response',
      created_at: 1770000000,
      status: 'completed',
      model: 'openai/gpt-5-mini',
      output: [
        {
          type: 'search_results',
          results: [
            {
              id: 1,
              url: 'https://example.com/ai',
              title: 'AI update',
              snippet: 'An update.',
            },
          ],
        },
        {
          type: 'message',
          id: 'msg-1',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
        },
      ],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
    };

    server.urls[AGENT_URL].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ type: 'response.created', sequence_number: 0, response: finalResponse })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.reasoning.started', sequence_number: 1, thought: 'Searching' })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.reasoning.search_results', sequence_number: 2, results: finalResponse.output[0].results })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.reasoning.stopped', sequence_number: 3 })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.output_item.added', sequence_number: 4, item: { type: 'message', id: 'msg-1', content: [] }, output_index: 1 })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.output_text.delta', sequence_number: 5, item_id: 'msg-1', delta: 'Hello' })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.output_item.done', sequence_number: 6, item: finalResponse.output[1], output_index: 1 })}\n\n`,
        `data: ${JSON.stringify({ type: 'response.completed', sequence_number: 7, response: finalResponse })}\n\n`,
      ],
    };

    const { stream } = await createModel().doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts.map(part => part.type)).toEqual([
      'stream-start',
      'raw',
      'response-metadata',
      'raw',
      'reasoning-start',
      'reasoning-delta',
      'raw',
      'source',
      'raw',
      'reasoning-end',
      'raw',
      'text-start',
      'raw',
      'text-delta',
      'raw',
      'text-end',
      'raw',
      'finish',
    ]);
  });
});
