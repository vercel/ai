import {
  InvalidArgumentError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { PerplexityLanguageModel } from './perplexity-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const AGENT_URL = 'https://api.perplexity.ai/v1/agent';

const model = new PerplexityLanguageModel('low', {
  baseURL: 'https://api.perplexity.ai',
  headers: () => ({
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
  }),
  generateId: mockId(),
});

const server = createTestServer({
  [AGENT_URL]: {},
});

function createUsage() {
  return {
    input_tokens: 120,
    input_tokens_details: {
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
    },
    output_tokens: 45,
    output_tokens_details: { reasoning_tokens: 5 },
    total_tokens: 165,
    tool_calls_details: { search_web: { invocation: 2 } },
    cost: {
      currency: 'USD',
      input_cost: 0.001,
      output_cost: 0.002,
      tool_calls_cost: 0.003,
      total_cost: 0.006,
    },
  };
}

function createResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resp-123',
    created_at: 1784292159,
    model: 'openai/gpt-5.1',
    object: 'response',
    output: [
      {
        type: 'search_results',
        queries: ['latest AI news'],
        results: [
          {
            id: 1,
            title: 'Example source',
            url: 'https://example.com/source',
            snippet: 'An example search result.',
            date: '2026-08-01',
            source: 'web',
          },
        ],
      },
      {
        id: 'msg-123',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'Hello from Perplexity.',
            annotations: [],
          },
        ],
      },
    ],
    status: 'completed',
    usage: createUsage(),
    ...overrides,
  };
}

function prepareJsonResponse(
  body: Record<string, unknown> = createResponse(),
  headers?: Record<string, string>,
) {
  server.urls[AGENT_URL].response = {
    type: 'json-value',
    body,
    headers,
  };
}

function prepareStream(chunks: Record<string, unknown>[]) {
  server.urls[AGENT_URL].response = {
    type: 'stream-chunks',
    chunks: [
      ...chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
      'data: [DONE]\n\n',
    ],
  };
}

function createStreamChunks(responseOverrides: Record<string, unknown> = {}) {
  const completedResponse = createResponse(responseOverrides);
  return [
    {
      type: 'response.created',
      sequence_number: 0,
      response: createResponse({ output: [], usage: undefined }),
    },
    {
      type: 'response.reasoning.search_results',
      sequence_number: 1,
      results: [
        {
          id: 1,
          title: 'Example source',
          url: 'https://example.com/source',
          snippet: 'An example search result.',
          source: 'web',
        },
      ],
    },
    {
      type: 'response.output_text.delta',
      sequence_number: 2,
      item_id: 'msg-123',
      output_index: 1,
      content_index: 0,
      delta: 'Hello ',
    },
    {
      type: 'response.output_text.delta',
      sequence_number: 3,
      item_id: 'msg-123',
      output_index: 1,
      content_index: 0,
      delta: 'from Perplexity.',
    },
    {
      type: 'response.output_text.done',
      sequence_number: 4,
      item_id: 'msg-123',
      output_index: 1,
      content_index: 0,
      text: 'Hello from Perplexity.',
    },
    {
      type: 'response.completed',
      sequence_number: 5,
      response: completedResponse,
    },
  ];
}

describe('doGenerate', () => {
  it('extracts text, sources, usage, cost, and response metadata', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'source',
        sourceType: 'url',
        id: '1',
        url: 'https://example.com/source',
        title: 'Example source',
      }),
      { type: 'text', text: 'Hello from Perplexity.' },
    ]);
    expect(result.usage).toEqual({
      inputTokens: {
        total: 120,
        noCache: 90,
        cacheRead: 20,
        cacheWrite: 10,
      },
      outputTokens: { total: 45, text: 40, reasoning: 5 },
      raw: createUsage(),
    });
    expect(result.providerMetadata).toEqual({
      perplexity: {
        usage: { citationTokens: null, numSearchQueries: 2 },
        images: null,
        cost: {
          inputTokensCost: 0.001,
          outputTokensCost: 0.002,
          requestCost: null,
          totalCost: 0.006,
          currency: 'USD',
          cacheCreationCost: null,
          cacheReadCost: null,
          toolCallsCost: 0.003,
        },
        toolCalls: { search_web: { invocation: 2 } },
      },
    });
    expect(result.response).toEqual(
      expect.objectContaining({
        id: 'resp-123',
        modelId: 'openai/gpt-5.1',
        timestamp: new Date(1784292159 * 1000),
      }),
    );
  });

  it('sends an Agent API preset request', async () => {
    prepareJsonResponse();

    await model.doGenerate({ prompt: TEST_PROMPT });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'low',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
    });
  });

  it('maps legacy Sonar IDs to presets with a deprecation warning', async () => {
    prepareJsonResponse();
    const legacyModel = new PerplexityLanguageModel('sonar-deep-research', {
      baseURL: 'https://api.perplexity.ai',
      generateId: mockId(),
    });

    const result = await legacyModel.doGenerate({ prompt: TEST_PROMPT });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'high',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
    });
    expect(result.warnings).toContainEqual({
      type: 'deprecated',
      setting: 'model ID "sonar-deep-research"',
      message: 'Use the Perplexity Agent API preset "high" instead.',
    });
  });

  it('sends direct model IDs as Agent API models', async () => {
    prepareJsonResponse();
    const directModel = new PerplexityLanguageModel('openai/gpt-5.1', {
      baseURL: 'https://api.perplexity.ai',
      generateId: mockId(),
    });

    await directModel.doGenerate({ prompt: TEST_PROMPT });

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'openai/gpt-5.1',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
    });
  });

  it('passes Agent API provider options and AI SDK function tools', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 200,
      temperature: 0.4,
      topP: 0.9,
      reasoning: 'high',
      responseFormat: {
        type: 'json',
        name: 'answer',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
      tools: [
        {
          type: 'function',
          name: 'weather',
          description: 'Get the weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
          strict: true,
        },
      ],
      providerOptions: {
        perplexity: {
          max_steps: 4,
          previous_response_id: 'resp-previous',
          store: false,
          tools: [{ type: 'web_search', search_context_size: 'low' }],
          future_option: { enabled: true },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'low',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
      max_output_tokens: 200,
      temperature: 0.4,
      top_p: 0.9,
      reasoning: { effort: 'high' },
      max_steps: 4,
      previous_response_id: 'resp-previous',
      store: false,
      future_option: { enabled: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'answer',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      tools: [
        { type: 'web_search', search_context_size: 'low' },
        {
          type: 'function',
          name: 'weather',
          description: 'Get the weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
          strict: true,
        },
      ],
    });
  });

  it('relocates legacy Sonar search filters to the web_search tool', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        perplexity: {
          search_recency_filter: 'month',
          search_domain_filter: ['example.com'],
          num_search_results: 5,
          web_search_options: {
            search_context_size: 'medium',
            user_location: { country: 'US' },
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'low',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
      tools: [
        {
          type: 'web_search',
          filters: {
            search_recency_filter: 'month',
            search_domain_filter: ['example.com'],
          },
          max_results: 5,
          search_context_size: 'medium',
          user_location: { country: 'US' },
        },
      ],
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'deprecated',
        setting: 'Sonar search options',
      }),
    );
  });

  it('warns and drops Sonar options without Agent API equivalents', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        perplexity: {
          return_images: true,
          search_language_filter: ['en'],
          stream_mode: 'full',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'low',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { type: 'unsupported', feature: 'return_images' },
        { type: 'unsupported', feature: 'search_language_filter' },
        { type: 'unsupported', feature: 'stream_mode' },
      ]),
    );
  });

  it('maps disable_search to the Agent API preset workaround', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        perplexity: {
          disable_search: true,
          tools: [{ type: 'web_search' }],
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'low',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
      max_tool_calls: 0,
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'compatibility',
          feature: 'disable_search with a preset',
        }),
      ]),
    );
  });

  it('rejects invalid provider options', async () => {
    await expect(
      model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          perplexity: { search_recency_filter: 'decade' },
        },
      }),
    ).rejects.toThrow(InvalidArgumentError);
  });

  it('extracts function calls', async () => {
    prepareJsonResponse(
      createResponse({
        status: 'requires_action',
        output: [
          {
            id: 'fc-123',
            type: 'function_call',
            status: 'completed',
            call_id: 'call-123',
            name: 'weather',
            arguments: '{"city":"San Francisco"}',
            thought_signature: 'signature-123',
          },
        ],
      }),
    );

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'weather',
        input: '{"city":"San Francisco"}',
        providerMetadata: {
          perplexity: {
            itemId: 'fc-123',
            thoughtSignature: 'signature-123',
          },
        },
      },
    ]);
    expect(result.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'requires_action',
    });
  });

  it('passes request and provider headers and exposes response headers', async () => {
    prepareJsonResponse(createResponse(), { 'test-header': 'test-value' });
    const customModel = new PerplexityLanguageModel('fast', {
      baseURL: 'https://api.perplexity.ai',
      headers: () => ({
        authorization: 'Bearer custom-key',
        'custom-provider-header': 'provider-value',
      }),
      generateId: mockId(),
    });

    const result = await customModel.doGenerate({
      prompt: TEST_PROMPT,
      headers: { 'custom-request-header': 'request-value' },
    });

    expect(server.calls[0].requestHeaders).toEqual(
      expect.objectContaining({
        authorization: 'Bearer custom-key',
        'custom-provider-header': 'provider-value',
        'custom-request-header': 'request-value',
      }),
    );
    expect(result.response?.headers).toEqual(
      expect.objectContaining({ 'test-header': 'test-value' }),
    );
  });
});

describe('doStream', () => {
  it('streams typed Agent API events as text, sources, usage, and metadata', async () => {
    prepareStream(createStreamChunks());

    const result = await model.doStream({ prompt: TEST_PROMPT });
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'response-metadata',
        id: 'resp-123',
        modelId: 'openai/gpt-5.1',
        timestamp: new Date(1784292159 * 1000),
      },
      expect.objectContaining({
        type: 'source',
        sourceType: 'url',
        url: 'https://example.com/source',
      }),
      { type: 'text-start', id: 'msg-123' },
      { type: 'text-delta', id: 'msg-123', delta: 'Hello ' },
      {
        type: 'text-delta',
        id: 'msg-123',
        delta: 'from Perplexity.',
      },
      { type: 'text-end', id: 'msg-123' },
      expect.objectContaining({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'completed' },
        usage: expect.objectContaining({
          inputTokens: expect.objectContaining({ total: 120 }),
          outputTokens: expect.objectContaining({ total: 45 }),
        }),
      }),
    ]);
  });

  it('sends the Agent API streaming request body', async () => {
    prepareStream(createStreamChunks());

    await model.doStream({ prompt: TEST_PROMPT });

    expect(await server.calls[0].requestBodyJson).toEqual({
      preset: 'low',
      input: [{ type: 'message', role: 'user', content: 'Hello' }],
      stream: true,
    });
  });

  it('streams raw Agent API events when requested', async () => {
    prepareStream(createStreamChunks());

    const result = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks.filter(chunk => chunk.type === 'raw')).toHaveLength(6);
    expect(chunks[1]).toEqual({
      type: 'raw',
      rawValue: createStreamChunks()[0],
    });
  });

  it('streams function calls from output items', async () => {
    const functionCall = {
      id: 'fc-123',
      type: 'function_call',
      status: 'completed',
      call_id: 'call-123',
      name: 'weather',
      arguments: '{"city":"San Francisco"}',
    };
    prepareStream([
      {
        type: 'response.created',
        sequence_number: 0,
        response: createResponse({ output: [], usage: undefined }),
      },
      {
        type: 'response.output_item.done',
        sequence_number: 1,
        output_index: 0,
        item: functionCall,
      },
      {
        type: 'response.completed',
        sequence_number: 2,
        response: createResponse({
          status: 'requires_action',
          output: [functionCall],
        }),
      },
    ]);

    const result = await model.doStream({ prompt: TEST_PROMPT });
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        {
          type: 'tool-input-start',
          id: 'call-123',
          toolName: 'weather',
        },
        {
          type: 'tool-input-delta',
          id: 'call-123',
          delta: '{"city":"San Francisco"}',
        },
        { type: 'tool-input-end', id: 'call-123' },
        expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'weather',
        }),
        expect.objectContaining({
          type: 'finish',
          finishReason: {
            unified: 'tool-calls',
            raw: 'requires_action',
          },
        }),
      ]),
    );
  });

  it('streams sources from fetch URL reasoning events', async () => {
    prepareStream([
      {
        type: 'response.reasoning.fetch_url_results',
        sequence_number: 0,
        contents: [
          {
            title: 'Fetched page',
            url: 'https://example.com/fetched',
            snippet: 'Fetched content.',
          },
        ],
      },
    ]);

    const result = await model.doStream({ prompt: TEST_PROMPT });
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'source',
          sourceType: 'url',
          url: 'https://example.com/fetched',
          title: 'Fetched page',
        }),
      ]),
    );
  });

  it('emits stream failures as errors', async () => {
    prepareStream([
      {
        type: 'response.failed',
        sequence_number: 0,
        error: { message: 'Agent run failed', type: 'server_error' },
      },
    ]);

    const result = await model.doStream({ prompt: TEST_PROMPT });
    const chunks = await convertReadableStreamToArray(result.stream);

    expect(chunks).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'error',
        error: { message: 'Agent run failed', type: 'server_error' },
      },
      expect.objectContaining({
        type: 'finish',
        finishReason: { unified: 'error', raw: 'failed' },
      }),
    ]);
  });
});
