import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createMistral } from '../mistral-provider';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const CONVERSATIONS_URL = 'https://api.mistral.ai/v1/conversations';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'system', content: 'Use web search for current information.' },
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is the latest Node.js release?' }],
  },
];

const provider = createMistral({
  apiKey: 'test-api-key',
  generateId: () => 'source-id',
});
const model = provider.conversations('mistral-small-latest');

const server = createTestServer({
  [CONVERSATIONS_URL]: {},
});

describe('doGenerate', () => {
  it('should send web search tools to the Conversations API', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search',
          name: 'search',
          args: {},
        },
      ],
      temperature: 0.3,
      providerOptions: {
        mistral: {
          store: false,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'mistral-small-latest',
      inputs: [
        {
          type: 'message.input',
          role: 'user',
          content: [
            { type: 'text', text: 'What is the latest Node.js release?' },
          ],
        },
      ],
      instructions: 'Use web search for current information.',
      tools: [{ type: 'web_search' }],
      completion_args: {
        temperature: 0.3,
      },
      store: false,
    });
  });

  it('should extract provider-executed tools, text, sources, usage, and metadata', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search',
          name: 'search',
          args: {},
        },
      ],
    });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"query":"latest Node.js release"}",
          "providerExecuted": true,
          "toolCallId": "tool-exec-1",
          "toolName": "search",
          "type": "tool-call",
        },
        {
          "result": {
            "info": {
              "result": "search results",
            },
          },
          "toolCallId": "tool-exec-1",
          "toolName": "search",
          "type": "tool-result",
        },
        {
          "providerMetadata": {
            "mistral": {
              "entryId": "message-1",
            },
          },
          "text": "Node.js 26.5.0 is current",
          "type": "text",
        },
        {
          "id": "source-id",
          "providerMetadata": {
            "mistral": {
              "description": "Release announcement",
              "favicon": "https://nodejs.org/favicon.ico",
              "tool": "web_search",
            },
          },
          "sourceType": "url",
          "title": "Node.js 26.5.0",
          "type": "source",
          "url": "https://nodejs.org/en/blog/release/v26.5.0",
        },
        {
          "providerMetadata": {
            "mistral": {
              "entryId": "message-1",
            },
          },
          "text": ".",
          "type": "text",
        },
      ]
    `);
    expect(result.finishReason).toStrictEqual({
      unified: 'stop',
      raw: 'stop',
    });
    expect(result.usage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": undefined,
          "cacheWrite": undefined,
          "noCache": 12,
          "total": 12,
        },
        "outputTokens": {
          "reasoning": undefined,
          "text": 8,
          "total": 8,
        },
        "raw": {
          "completion_tokens": 8,
          "connector_tokens": 100,
          "connectors": {
            "web_search": 1,
          },
          "prompt_tokens": 12,
          "total_tokens": 120,
        },
      }
    `);
    expect(result.providerMetadata).toStrictEqual({
      mistral: {
        conversationId: 'conversation-1',
      },
    });
    expect(result.response).toMatchObject({
      id: 'conversation-1',
      modelId: 'mistral-small-latest',
      timestamp: new Date('2026-07-15T10:00:00.000Z'),
    });
  });

  it('should serialize premium web search', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search_premium',
          name: 'premiumSearch',
          args: {},
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      tools: [{ type: 'web_search_premium' }],
    });
  });

  it('should warn and omit required tool choice for built-in tools', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search',
          name: 'search',
          args: {},
        },
      ],
      toolChoice: { type: 'required' },
    });

    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'required tool choice with Mistral built-in tools',
      details:
        "Mistral's Conversations API does not allow tool_choice 'required' when built-in tools are present.",
    });
    expect(
      (await server.calls[0].requestBodyJson).completion_args,
    ).toBeUndefined();
  });

  it('should support mixed function and built-in tools', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search',
          name: 'search',
          args: {},
        },
        {
          type: 'function',
          name: 'weather',
          description: 'Get the weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      tools: [
        { type: 'web_search' },
        {
          type: 'function',
          function: {
            name: 'weather',
            description: 'Get the weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        },
      ],
    });
  });

  it('should extract client-executed function calls', async () => {
    server.urls[CONVERSATIONS_URL].response = {
      type: 'json-value',
      body: {
        object: 'conversation.response',
        conversation_id: 'conversation-1',
        outputs: [
          {
            type: 'function.call',
            id: 'function-call-entry-1',
            tool_call_id: 'tool-call-1',
            name: 'weather',
            arguments: '{"city":"Paris"}',
            created_at: '2026-07-15T10:00:00.000Z',
            model: 'mistral-small-latest',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      },
    };

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'function',
          name: 'weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      ],
    });

    expect(result.content).toStrictEqual([
      {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'weather',
        input: '{"city":"Paris"}',
      },
    ]);
    expect(result.finishReason).toStrictEqual({
      unified: 'tool-calls',
      raw: 'tool_calls',
    });
  });

  it('should replay provider-executed tool calls as conversation entries', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tool-exec-previous',
              toolName: 'search',
              input: { query: 'previous query' },
              providerExecuted: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'tool-exec-previous',
              toolName: 'search',
              output: {
                type: 'json',
                value: { info: { result: 'previous search results' } },
              },
            },
            { type: 'text', text: 'Previous answer.' },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Tell me more.' }],
        },
      ],
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search',
          name: 'search',
          args: {},
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      inputs: [
        {
          type: 'tool.execution',
          id: 'tool-exec-previous',
          name: 'web_search',
          arguments: '{"query":"previous query"}',
          info: { result: 'previous search results' },
        },
        {
          type: 'message.output',
          role: 'assistant',
          content: [{ type: 'text', text: 'Previous answer.' }],
        },
        {
          type: 'message.input',
          role: 'user',
          content: [{ type: 'text', text: 'Tell me more.' }],
        },
      ],
    });
  });
});

describe('doStream', () => {
  it('should stream provider-executed tool calls, results, sources, and metadata', async () => {
    server.urls[CONVERSATIONS_URL].response = {
      type: 'stream-chunks',
      chunks: [
        eventChunk('conversation.response.started', {
          type: 'conversation.response.started',
          created_at: '2026-07-15T10:00:00.000Z',
          conversation_id: 'conversation-1',
        }),
        eventChunk('tool.execution.started', {
          type: 'tool.execution.started',
          id: 'tool-exec-1',
          name: 'web_search',
          arguments: '',
        }),
        eventChunk('tool.execution.delta', {
          type: 'tool.execution.delta',
          id: 'tool-exec-1',
          name: 'web_search',
          arguments: '{"query":"Node.js',
        }),
        eventChunk('tool.execution.delta', {
          type: 'tool.execution.delta',
          id: 'tool-exec-1',
          name: 'web_search',
          arguments: ' release"}',
        }),
        eventChunk('tool.execution.done', {
          type: 'tool.execution.done',
          id: 'tool-exec-1',
          name: 'web_search',
          info: { result: 'search results' },
        }),
        eventChunk('message.output.delta', {
          type: 'message.output.delta',
          id: 'message-1',
          content: 'Node.js 26.5.0',
        }),
        eventChunk('message.output.delta', {
          type: 'message.output.delta',
          id: 'message-1',
          content: {
            type: 'tool_reference',
            tool: 'web_search',
            title: 'Node.js 26.5.0',
            url: 'https://nodejs.org/en/blog/release/v26.5.0',
            favicon: null,
            description: null,
          },
        }),
        eventChunk('conversation.response.done', {
          type: 'conversation.response.done',
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            total_tokens: 120,
            connector_tokens: 100,
            connectors: { web_search: 1 },
          },
        }),
      ],
    };

    const result = await model.doStream({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider',
          id: 'mistral.web_search',
          name: 'search',
          args: {},
        },
      ],
    });

    expect(await convertReadableStreamToArray(result.stream))
      .toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "conversation-1",
          "modelId": "mistral-small-latest",
          "timestamp": 2026-07-15T10:00:00.000Z,
          "type": "response-metadata",
        },
        {
          "id": "tool-exec-1",
          "providerExecuted": true,
          "toolName": "search",
          "type": "tool-input-start",
        },
        {
          "delta": "{"query":"Node.js",
          "id": "tool-exec-1",
          "type": "tool-input-delta",
        },
        {
          "delta": " release"}",
          "id": "tool-exec-1",
          "type": "tool-input-delta",
        },
        {
          "id": "tool-exec-1",
          "type": "tool-input-end",
        },
        {
          "input": "{"query":"Node.js release"}",
          "providerExecuted": true,
          "toolCallId": "tool-exec-1",
          "toolName": "search",
          "type": "tool-call",
        },
        {
          "result": {
            "info": {
              "result": "search results",
            },
          },
          "toolCallId": "tool-exec-1",
          "toolName": "search",
          "type": "tool-result",
        },
        {
          "id": "message-1",
          "type": "text-start",
        },
        {
          "delta": "Node.js 26.5.0",
          "id": "message-1",
          "type": "text-delta",
        },
        {
          "id": "source-id",
          "providerMetadata": {
            "mistral": {
              "description": null,
              "favicon": null,
              "tool": "web_search",
            },
          },
          "sourceType": "url",
          "title": "Node.js 26.5.0",
          "type": "source",
          "url": "https://nodejs.org/en/blog/release/v26.5.0",
        },
        {
          "id": "message-1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "providerMetadata": {
            "mistral": {
              "conversationId": "conversation-1",
            },
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 12,
              "total": 12,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 8,
              "total": 8,
            },
            "raw": {
              "completion_tokens": 8,
              "connector_tokens": 100,
              "connectors": {
                "web_search": 1,
              },
              "prompt_tokens": 12,
              "total_tokens": 120,
            },
          },
        },
      ]
      `);
  });
});

function prepareJsonResponse() {
  server.urls[CONVERSATIONS_URL].response = {
    type: 'json-value',
    body: {
      object: 'conversation.response',
      conversation_id: 'conversation-1',
      outputs: [
        {
          object: 'entry',
          type: 'tool.execution',
          id: 'tool-exec-1',
          name: 'web_search',
          arguments: '{"query":"latest Node.js release"}',
          info: { result: 'search results' },
          created_at: '2026-07-15T10:00:00.000Z',
          model: 'mistral-small-latest',
        },
        {
          object: 'entry',
          type: 'message.output',
          id: 'message-1',
          content: [
            { type: 'text', text: 'Node.js 26.5.0 is current' },
            {
              type: 'tool_reference',
              tool: 'web_search',
              title: 'Node.js 26.5.0',
              url: 'https://nodejs.org/en/blog/release/v26.5.0',
              favicon: 'https://nodejs.org/favicon.ico',
              description: 'Release announcement',
            },
            { type: 'text', text: '.' },
          ],
          created_at: '2026-07-15T10:00:01.000Z',
          model: 'mistral-small-latest',
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 120,
        connector_tokens: 100,
        connectors: { web_search: 1 },
      },
    },
  };
}

function eventChunk(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
