import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { createAlibaba } from './alibaba-provider';
import { AlibabaUsage } from './convert-alibaba-usage';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const CHAT_COMPLETIONS_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

const provider = createAlibaba({ apiKey: 'test-api-key' });
const model = provider.chatModel('qwen-plus');
const server = createTestServer({ [CHAT_COMPLETIONS_URL]: {} });

describe('doGenerate', () => {
  function prepareJsonResponse({
    content = '',
    usage = {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  }: {
    content?: string;
    usage?: AlibabaUsage;
  }) {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body: {
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'qwen-plus',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content,
            },
            finish_reason: 'stop',
          },
        ],
        usage,
      },
    };
  }

  function prepareJsonFixtureResponse(filename: string) {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
  }

  it('should extract text content', async () => {
    prepareJsonFixtureResponse('alibaba-text');

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchSnapshot();
  });

  it('should extract tool call content', async () => {
    prepareJsonFixtureResponse('alibaba-tool-call');

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"location":"San Francisco"}",
          "toolCallId": "call-1",
          "toolName": "get_weather",
          "type": "tool-call",
        },
      ]
    `);
  });

  it('should extract usage with cache tokens', async () => {
    prepareJsonResponse({
      content: 'Hello',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        prompt_tokens_details: {
          cached_tokens: 80,
          cache_creation_input_tokens: 20,
        },
        completion_tokens_details: {
          reasoning_tokens: 10,
        },
      },
    });

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 80,
          "cacheWrite": 20,
          "noCache": 0,
          "total": 100,
        },
        "outputTokens": {
          "reasoning": 10,
          "text": 40,
          "total": 50,
        },
        "raw": {
          "completion_tokens": 50,
          "completion_tokens_details": {
            "reasoning_tokens": 10,
          },
          "prompt_tokens": 100,
          "prompt_tokens_details": {
            "cache_creation_input_tokens": 20,
            "cached_tokens": 80,
          },
          "total_tokens": 150,
        },
      }
    `);
  });

  it('should send enable_thinking in request body', async () => {
    prepareJsonResponse({ content: 'Answer' });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        alibaba: {
          enableThinking: true,
          thinkingBudget: 2048,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'qwen-plus',
      enable_thinking: true,
      thinking_budget: 2048,
    });
  });

  it('should extract reasoning from reasoning_content field', async () => {
    prepareJsonFixtureResponse('alibaba-reasoning');

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "The answer is 3.",
          "type": "text",
        },
        {
          "text": "Let me think about this step by step.",
          "type": "reasoning",
        },
      ]
    `);
  });
});

describe('doStream', () => {
  function prepareStreamResponse({ content }: { content: string[] }) {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"test-id","object":"chat.completion.chunk","created":1234567890,"model":"qwen-plus","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
        ...content.map(
          text =>
            `data: {"id":"test-id","object":"chat.completion.chunk","created":1234567890,"model":"qwen-plus","choices":[{"index":0,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`,
        ),
        `data: {"id":"test-id","object":"chat.completion.chunk","created":1234567890,"model":"qwen-plus","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const chunks = await convertReadableStreamToArray(stream);

    expect(chunks).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "test-id",
          "modelId": "qwen-plus",
          "timestamp": 2009-02-13T23:31:30.000Z,
          "type": "response-metadata",
        },
        {
          "id": "0",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "0",
          "type": "text-delta",
        },
        {
          "delta": ", ",
          "id": "0",
          "type": "text-delta",
        },
        {
          "delta": "world!",
          "id": "0",
          "type": "text-delta",
        },
        {
          "id": "0",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 10,
              "total": 10,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 20,
              "total": 20,
            },
            "raw": {
              "completion_tokens": 20,
              "prompt_tokens": 10,
              "total_tokens": 30,
            },
          },
        },
      ]
    `);
  });

  it('should stream tool deltas', async () => {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"id":"test-id","object":"chat.completion.chunk","created":1234567890,"model":"qwen-plus","choices":[{"index":0,"delta":{"role":"assistant","content":"","tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n\n`,
        `data: {"id":"test-id","object":"chat.completion.chunk","created":1234567890,"model":"qwen-plus","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location"}}]},"finish_reason":null}]}\n\n`,
        `data: {"id":"test-id","object":"chat.completion.chunk","created":1234567890,"model":"qwen-plus","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\"Paris\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":50,"completion_tokens":20,"total_tokens":70}}\n\n`,
        `data: [DONE]\n\n`,
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: false,
    });

    const chunks = await convertReadableStreamToArray(stream);

    expect(chunks).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "test-id",
          "modelId": "qwen-plus",
          "timestamp": 2009-02-13T23:31:30.000Z,
          "type": "response-metadata",
        },
        {
          "id": "call-1",
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "delta": "{"location",
          "id": "call-1",
          "type": "tool-input-delta",
        },
        {
          "delta": "":"Paris"}",
          "id": "call-1",
          "type": "tool-input-delta",
        },
        {
          "id": "call-1",
          "type": "tool-input-end",
        },
        {
          "input": "{"location":"Paris"}",
          "toolCallId": "call-1",
          "toolName": "get_weather",
          "type": "tool-call",
        },
        {
          "finishReason": {
            "raw": "tool_calls",
            "unified": "tool-calls",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": 0,
              "cacheWrite": 0,
              "noCache": 50,
              "total": 50,
            },
            "outputTokens": {
              "reasoning": 0,
              "text": 20,
              "total": 20,
            },
            "raw": {
              "completion_tokens": 20,
              "prompt_tokens": 50,
              "total_tokens": 70,
            },
          },
        },
      ]
    `);
  });
});
