import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4ToolCall,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMistral } from './mistral-provider';

const URL = 'https://api.mistral.ai/v1/conversations';
const provider = createMistral({
  apiKey: 'test-api-key',
  generateId: mockId(),
});
const model = provider.conversation('mistral-small-latest');
const tools: LanguageModelV4CallOptions['tools'] = [
  { type: 'provider', id: 'mistral.web_search', name: 'search', args: {} },
];
const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Who won?' }] },
];
const usage = {
  prompt_tokens: 10,
  completion_tokens: 20,
  total_tokens: 30,
  connector_tokens: 5,
  connectors: { web_search: 1 },
};
const execution = {
  type: 'tool.execution',
  id: 'search-1',
  name: 'web_search',
  arguments: 'latest results',
  info: { status: 'success' },
};
const reference = {
  type: 'tool_reference',
  tool: 'web_search',
  title: 'Results',
  url: 'https://example.com/results',
};
const answer = {
  type: 'message.output',
  model: 'mistral-small-latest',
  content: [{ type: 'text', text: 'Spain won.' }, reference],
};
const server = createTestServer({ [URL]: {} });

function prepareStream(events: unknown[]) {
  server.urls[URL].response = {
    type: 'stream-chunks',
    chunks: events.map(event => `data: ${JSON.stringify(event)}\n\n`),
  };
}

function followup(toolCall: LanguageModelV4ToolCall): LanguageModelV4Prompt {
  return [
    ...prompt,
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: JSON.parse(toolCall.input),
          providerExecuted: true,
          providerOptions: toolCall.providerMetadata,
        },
        {
          type: 'tool-result',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          output: { type: 'json', value: { info: execution.info } },
        },
        { type: 'text', text: 'Spain won.' },
      ],
    },
    { role: 'user', content: [{ type: 'text', text: 'Who did they beat?' }] },
  ];
}

describe('Mistral web search', () => {
  beforeEach(() => {
    server.urls[URL].response = {
      type: 'json-value',
      body: {
        conversation_id: 'conversation-1',
        outputs: [execution, answer],
        usage,
      },
    };
  });

  it.each(['doGenerate', 'doStream'] as const)(
    '%s forwards provider configuration and call options',
    async method => {
      const responseBody =
        method === 'doGenerate'
          ? JSON.stringify({
              conversation_id: 'conversation-1',
              outputs: [answer],
              usage,
            })
          : `data: ${JSON.stringify({ type: 'conversation.response.done', usage })}\n\n`;
      const fetch = vi.fn<FetchFunction>(
        async () =>
          new Response(responseBody, {
            headers: {
              'content-type':
                method === 'doGenerate'
                  ? 'application/json'
                  : 'text/event-stream',
              'x-response': 'response-value',
            },
          }),
      );
      const configuredModel = createMistral({
        apiKey: 'custom-api-key',
        baseURL: 'https://custom.example.com/v1/',
        headers: { 'x-provider': 'provider-value' },
        fetch,
      }).conversation('mistral-small-latest');
      const abortSignal = new AbortController().signal;
      const result = await configuredModel[method]({
        prompt,
        tools,
        headers: { 'x-call': 'call-value' },
        abortSignal,
      });
      if ('stream' in result) {
        const parts = await convertReadableStreamToArray(result.stream);
        expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] });
        expect(parts.at(-1)).toMatchObject({
          type: 'finish',
          finishReason: { unified: 'stop' },
        });
      } else {
        expect(result.content).toContainEqual({
          type: 'text',
          text: 'Spain won.',
        });
        expect(result.finishReason).toEqual({
          unified: 'stop',
          raw: undefined,
        });
      }
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://custom.example.com/v1/conversations');
      expect(init?.signal).toBe(abortSignal);
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer custom-api-key');
      expect(headers.get('x-provider')).toBe('provider-value');
      expect(headers.get('x-call')).toBe('call-value');
      expect(result.response?.headers?.['x-response']).toBe('response-value');
      expect(JSON.parse(init?.body as string)).toEqual(result.request?.body);
    },
  );

  it('uses Conversations even when no search tools are supplied', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: { conversation_id: 'conversation-1', outputs: [answer], usage },
    };
    await model.doGenerate({ prompt });
    expect(model.provider).toBe('mistral.conversation');
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'mistral-small-latest',
      store: false,
      inputs: [
        {
          type: 'message.input',
          role: 'user',
          content: [{ type: 'text', text: 'Who won?' }],
        },
      ],
      completion_args: {},
    });
  });

  it('exposes standard and premium provider-executed tools', () => {
    expect(provider.tools.webSearch()).toMatchObject({
      type: 'provider',
      id: 'mistral.web_search',
      isProviderExecuted: true,
      args: {},
    });
    expect(provider.tools.webSearchPremium()).toMatchObject({
      type: 'provider',
      id: 'mistral.web_search_premium',
      isProviderExecuted: true,
      args: {},
    });
  });

  it('routes search through Conversations and maps the tool name, result, sources, and usage', async () => {
    const result = await model.doGenerate({ prompt, tools });
    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'search-1',
        toolName: 'search',
        input: '{"arguments":"latest results"}',
        providerExecuted: true,
        providerMetadata: {
          mistral: { type: 'tool.execution', name: 'web_search' },
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'search-1',
        toolName: 'search',
        result: { info: { status: 'success' } },
      },
      { type: 'text', text: 'Spain won.' },
      {
        type: 'source',
        sourceType: 'url',
        id: expect.any(String),
        url: reference.url,
        title: reference.title,
      },
    ]);
    expect(result.finishReason.unified).toBe('stop');
    expect(result.usage).toMatchObject({
      inputTokens: { total: 10 },
      outputTokens: { total: 20 },
      raw: usage,
    });
    expect(result.response).toMatchObject({
      id: 'conversation-1',
      modelId: 'mistral-small-latest',
    });
    expect(result.warnings).toEqual([]);
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'mistral-small-latest',
      store: false,
      inputs: [
        {
          type: 'message.input',
          role: 'user',
          content: [{ type: 'text', text: 'Who won?' }],
        },
      ],
      tools: [{ type: 'web_search' }],
      completion_args: {},
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
    });
  });

  it('sends instructions and completion settings in their Conversations API locations', async () => {
    await model.doGenerate({
      prompt: [
        { role: 'system', content: 'Be accurate.' },
        { role: 'system', content: 'Be concise.' },
        ...prompt,
      ],
      tools,
      maxOutputTokens: 100,
      temperature: 0.3,
      topP: 0.9,
      frequencyPenalty: 0.1,
      presencePenalty: 0.2,
      stopSequences: ['END'],
      seed: 1,
      responseFormat: { type: 'json', schema: { type: 'object' } },
      toolChoice: { type: 'required' },
      reasoning: 'high',
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      instructions: 'Be accurate.\n\nBe concise.',
      completion_args: {
        max_tokens: 100,
        temperature: 0.3,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.2,
        stop: ['END'],
        random_seed: 1,
        tool_choice: 'any',
        reasoning_effort: 'high',
        response_format: {
          type: 'json_schema',
          json_schema: { schema: { type: 'object' } },
        },
      },
    });
  });

  it('supports premium search and forcing a renamed search tool', async () => {
    await model.doGenerate({
      prompt,
      tools: [
        ...tools!,
        {
          type: 'provider',
          id: 'mistral.web_search_premium',
          name: 'news',
          args: {},
        },
      ],
      toolChoice: { type: 'tool', toolName: 'news' },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      tools: [{ type: 'web_search_premium' }],
      completion_args: { tool_choice: 'any' },
    });
  });

  it('replays search executions and assistant answers on a follow-up turn', async () => {
    const first = await model.doGenerate({ prompt, tools });
    const toolCall = first.content[0] as LanguageModelV4ToolCall;
    await model.doGenerate({ prompt: followup(toolCall), tools });
    expect((await server.calls[1].requestBodyJson).inputs).toEqual([
      {
        type: 'message.input',
        role: 'user',
        content: [{ type: 'text', text: 'Who won?' }],
      },
      {
        type: 'function.call',
        tool_call_id: 'search-1',
        name: 'web_search',
        arguments: 'latest results',
      },
      {
        type: 'function.result',
        tool_call_id: 'search-1',
        result: JSON.stringify(execution.info),
      },
      {
        type: 'message.input',
        role: 'assistant',
        content: [{ type: 'text', text: 'Spain won.' }],
      },
      {
        type: 'message.input',
        role: 'user',
        content: [{ type: 'text', text: 'Who did they beat?' }],
      },
    ]);
  });

  it('preserves the executed function and raw search result for replay', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: {
        conversation_id: 'conversation-1',
        outputs: [
          {
            ...execution,
            function: 'web_fetch',
            arguments: '{"url":"https://example.com"}',
            info: { result: '[{"text":"Retrieved page"}]' },
          },
          answer,
        ],
        usage,
      },
    };
    const result = await model.doGenerate({ prompt, tools });
    const toolCall = result.content[0] as LanguageModelV4ToolCall;
    const history = followup(toolCall);
    if (
      history[1].role === 'assistant' &&
      history[1].content[1].type === 'tool-result'
    ) {
      history[1].content[1].output = {
        type: 'json',
        value: { info: { result: '[{"text":"Retrieved page"}]' } },
      };
    }
    await model.doGenerate({ prompt: history, tools });
    expect((await server.calls[1].requestBodyJson).inputs.slice(1, 3)).toEqual([
      {
        type: 'function.call',
        tool_call_id: 'search-1',
        name: 'web_fetch',
        arguments: '{"url":"https://example.com"}',
      },
      {
        type: 'function.result',
        tool_call_id: 'search-1',
        result: '[{"text":"Retrieved page"}]',
      },
    ]);
  });

  it('can replay search history after the tool is removed', async () => {
    const first = await model.doGenerate({ prompt, tools });
    await model.doGenerate({
      prompt: followup(first.content[0] as LanguageModelV4ToolCall),
    });
    expect((await server.calls[1].requestBodyJson).inputs[1]).toMatchObject({
      type: 'function.call',
      name: 'web_search',
    });
  });

  it('does not retain history on a shared model instance', async () => {
    await model.doGenerate({ prompt, tools });
    await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Independent search' }],
        },
      ],
      tools,
    });
    expect((await server.calls[1].requestBodyJson).inputs).toEqual([
      {
        type: 'message.input',
        role: 'user',
        content: [{ type: 'text', text: 'Independent search' }],
      },
    ]);
  });

  it('supports function calls alongside search and replays their results', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: {
        conversation_id: 'conversation-1',
        outputs: [
          execution,
          {
            type: 'function.call',
            tool_call_id: 'function-1',
            name: 'weather',
            arguments: { city: 'Madrid' },
          },
        ],
        usage,
      },
    };
    const mixedTools: LanguageModelV4CallOptions['tools'] = [
      ...tools!,
      { type: 'function', name: 'weather', inputSchema: { type: 'object' } },
    ];
    const first = await model.doGenerate({ prompt, tools: mixedTools });
    expect(first.finishReason.unified).toBe('tool-calls');
    expect(first.content[2]).toEqual({
      type: 'tool-call',
      toolCallId: 'function-1',
      toolName: 'weather',
      input: '{"city":"Madrid"}',
    });
    await model.doGenerate({
      prompt: [
        ...followup(first.content[0] as LanguageModelV4ToolCall),
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'function-1',
              toolName: 'weather',
              input: { city: 'Madrid' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'function-1',
              toolName: 'weather',
              output: { type: 'json', value: { temperature: 20 } },
            },
          ],
        },
      ],
      tools: mixedTools,
    });
    expect((await server.calls[1].requestBodyJson).inputs.slice(-2)).toEqual([
      {
        type: 'function.call',
        tool_call_id: 'function-1',
        name: 'weather',
        arguments: '{"city":"Madrid"}',
      },
      {
        type: 'function.result',
        tool_call_id: 'function-1',
        result: '{"temperature":20}',
      },
    ]);
  });

  it('handles string output, reasoning, duplicate references, and references without URLs', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: {
        conversation_id: 'conversation-1',
        outputs: [
          { type: 'message.output', content: 'Hello' },
          {
            type: 'message.output',
            content: [
              { type: 'thinking', thinking: [{ type: 'text', text: 'Think' }] },
              reference,
              reference,
              { ...reference, url: null },
              { type: 'text', text: '' },
            ],
          },
        ],
        usage: {},
      },
    };
    const result = await model.doGenerate({ prompt, tools });
    expect(result.content).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'reasoning', text: 'Think' },
      {
        type: 'source',
        sourceType: 'url',
        id: expect.any(String),
        url: reference.url,
        title: reference.title,
      },
    ]);
  });

  it('warns about unsupported Conversations options', async () => {
    const result = await model.doGenerate({
      prompt,
      tools,
      providerOptions: {
        mistral: {
          safePrompt: true,
          parallelToolCalls: false,
          promptCacheKey: 'cache',
          documentImageLimit: 1,
          documentPageLimit: 2,
        },
      },
    });
    expect(
      result.warnings.map(warning =>
        warning.type === 'unsupported' ? warning.feature : undefined,
      ),
    ).toEqual([
      'safePrompt',
      'documentImageLimit',
      'documentPageLimit',
      'promptCacheKey',
      'parallelToolCalls',
    ]);
    const body = await server.calls[0].requestBodyJson;
    expect(body).not.toHaveProperty('safe_prompt');
    expect(body.completion_args).not.toHaveProperty('parallel_tool_calls');
  });

  it('streams search execution, reasoning, text, references and usage', async () => {
    prepareStream([
      {
        type: 'conversation.response.started',
        conversation_id: 'conversation-1',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        type: 'tool.execution.started',
        id: 'search-1',
        name: 'web_search',
        arguments: '',
      },
      {
        type: 'tool.execution.delta',
        id: 'search-1',
        name: 'web_search',
        arguments: 'latest ',
      },
      {
        type: 'tool.execution.delta',
        id: 'search-1',
        name: 'web_search',
        arguments: 'results',
      },
      {
        type: 'tool.execution.done',
        id: 'search-1',
        name: 'web_search',
        info: execution.info,
      },
      {
        type: 'message.output.delta',
        id: 'message-1',
        content: {
          type: 'thinking',
          thinking: [{ type: 'text', text: 'Think' }],
        },
      },
      {
        type: 'message.output.delta',
        id: 'message-1',
        content_index: 1,
        content: 'Spain ',
      },
      {
        type: 'message.output.delta',
        id: 'message-1',
        content_index: 1,
        content: { type: 'text', text: 'won.' },
      },
      {
        type: 'message.output.delta',
        id: 'message-1',
        content_index: 2,
        content: reference,
      },
      { type: 'conversation.response.done', usage },
    ]);
    const result = await model.doStream({ prompt, tools });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.map(part => part.type)).toEqual([
      'stream-start',
      'response-metadata',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'tool-result',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-delta',
      'source',
      'text-end',
      'finish',
    ]);
    expect(parts.find(part => part.type === 'tool-call')).toMatchObject({
      toolName: 'search',
      providerExecuted: true,
      input: '{"arguments":"latest results"}',
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop' },
      usage: { inputTokens: { total: 10 }, outputTokens: { total: 20 } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      stream: true,
      tools: [{ type: 'web_search' }],
    });
    server.urls[URL].response = {
      type: 'json-value',
      body: { conversation_id: 'conversation-2', outputs: [answer], usage },
    };
    await model.doGenerate({
      prompt: followup(
        parts.find(
          part => part.type === 'tool-call',
        ) as LanguageModelV4ToolCall,
      ),
      tools,
    });
    expect((await server.calls[1].requestBodyJson).inputs[1]).toMatchObject({
      type: 'function.call',
      arguments: 'latest results',
    });
  });

  it('streams incremental function calls alongside search', async () => {
    prepareStream([
      {
        type: 'function.call.delta',
        tool_call_id: 'function-1',
        name: 'weather',
        arguments: '{"city":',
        output_index: 0,
      },
      {
        type: 'function.call.delta',
        tool_call_id: 'function-1',
        name: 'weather',
        arguments: '"Madrid"}',
        output_index: 0,
      },
      { type: 'conversation.response.done', usage },
    ]);
    const result = await model.doStream({ prompt, tools });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.find(part => part.type === 'tool-call')).toMatchObject({
      toolCallId: 'function-1',
      toolName: 'weather',
      input: '{"city":"Madrid"}',
    });
    expect(parts.at(-1)).toMatchObject({
      finishReason: { unified: 'tool-calls' },
    });
  });

  it('streams premium search without execution info and reports the model ID', async () => {
    prepareStream([
      {
        type: 'tool.execution.started',
        id: 'search-1',
        name: 'web_search_premium',
        arguments: 'query',
        function: 'web_search',
      },
      {
        type: 'tool.execution.done',
        id: 'search-1',
        name: 'web_search_premium',
      },
      {
        type: 'message.output.delta',
        id: 'message-1',
        model: 'mistral-small-latest',
        content: 'Answer',
      },
      { type: 'conversation.response.done', usage },
    ]);
    const result = await model.doStream({
      prompt,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search_premium',
          name: 'news',
          args: {},
        },
      ],
    });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.find(part => part.type === 'tool-call')).toMatchObject({
      providerMetadata: { mistral: { function: 'web_search' } },
    });
    expect(parts).toContainEqual({
      type: 'tool-result',
      toolCallId: 'search-1',
      toolName: 'news',
      result: {},
    });
    expect(parts).toContainEqual({
      type: 'response-metadata',
      modelId: 'mistral-small-latest',
    });
    expect(parts.at(-1)).toMatchObject({ finishReason: { unified: 'stop' } });
  });

  it.each([
    [
      {
        type: 'conversation.response.error',
        message: 'Search failed',
        code: 500,
      },
    ],
    [{ type: 'message.output.delta', id: 'message-1', content: 42 }],
    [
      {
        type: 'tool.execution.started',
        id: 'search-1',
        name: 'web_search',
        arguments: '',
      },
      { type: 'conversation.response.done', usage },
    ],
    [{ type: 'message.output.delta', id: 'message-1', content: 'Truncated' }],
  ])('reports failed or incomplete streams', async (...events) => {
    prepareStream(events);
    const result = await model.doStream({ prompt, tools });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.at(-1)).toMatchObject({ finishReason: { unified: 'error' } });
  });

  it('includes raw events when requested', async () => {
    const event = { type: 'conversation.response.done', usage };
    prepareStream([event]);
    const result = await model.doStream({
      prompt,
      tools,
      includeRawChunks: true,
    });
    expect(await convertReadableStreamToArray(result.stream)).toContainEqual({
      type: 'raw',
      rawValue: event,
    });
  });
});
