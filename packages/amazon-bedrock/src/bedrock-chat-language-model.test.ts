import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  createTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { vi } from 'vitest';
import { injectFetchHeaders } from './inject-fetch-headers';
import {
  BedrockReasoningContentBlock,
  BedrockRedactedReasoningContentBlock,
} from './bedrock-api-types';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'system', content: 'System Prompt' },
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const mockTrace = {
  guardrail: {
    inputAssessment: {
      '1abcd2ef34gh': {
        contentPolicy: {
          filters: [
            {
              action: 'BLOCKED' as const,
              confidence: 'LOW' as const,
              type: 'INSULTS' as const,
            },
          ],
        },
        wordPolicy: {
          managedWordLists: [
            {
              action: 'BLOCKED' as const,
              match: '<rude word>',
              type: 'PROFANITY' as const,
            },
          ],
        },
      },
    },
  },
};

const fakeFetchWithAuth = injectFetchHeaders({ 'x-amz-auth': 'test-auth' });

const modelId = 'anthropic.claude-3-haiku-20240307-v1:0';
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';

const streamUrl = `${baseUrl}/model/${encodeURIComponent(
  modelId,
)}/converse-stream`;
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;
const server = createTestServer({
  [generateUrl]: {},
  [streamUrl]: {
    response: {
      type: 'stream-chunks',
      chunks: [],
    },
  },
});

beforeEach(() => {
  server.urls[streamUrl].response = {
    type: 'stream-chunks',
    chunks: [],
  };
});

const model = new BedrockChatLanguageModel(modelId, {
  baseUrl: () => baseUrl,
  headers: {},
  fetch: fakeFetchWithAuth,
  generateId: () => 'test-id',
});

let mockOptions: { success: boolean; errorValue?: any } = { success: true };

describe('doStream', () => {
  beforeEach(() => {
    mockOptions = { success: true, errorValue: undefined };
  });

  vi.mock('./bedrock-event-stream-response-handler', () => ({
    createBedrockEventStreamResponseHandler: (schema: any) => {
      return async ({ response }: { response: Response }) => {
        let chunks: { success: boolean; value: any }[] = [];
        if (mockOptions.success) {
          const text = await response.text();
          chunks = text
            .split('\n')
            .filter(Boolean)
            .map(chunk => ({
              success: true,
              value: JSON.parse(chunk),
            }));
        }
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          responseHeaders: headers,
          value: new ReadableStream({
            start(controller) {
              if (mockOptions.success) {
                chunks.forEach(chunk => controller.enqueue(chunk));
              } else {
                controller.enqueue({
                  success: false,
                  error: mockOptions.errorValue,
                });
              }
              controller.close();
            },
          }),
        };
      };
    },
  }));

  function setupMockEventStreamHandler(
    options: { success?: boolean; errorValue?: any } = { success: true },
  ) {
    mockOptions = { ...mockOptions, ...options };
  }

  it('should stream text deltas with metadata and usage', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Hello' },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { text: ', ' },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 2,
            delta: { text: 'World!' },
          },
        }) + '\n',
        JSON.stringify({
          metadata: {
            usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
            metrics: { latencyMs: 10 },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "text": "Hello",
          "type": "text",
        },
        {
          "text": ", ",
          "type": "text",
        },
        {
          "text": "World!",
          "type": "text",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 4,
            "outputTokens": 34,
            "totalTokens": 38,
          },
        },
      ]
    `);
  });

  it('should stream tool deltas', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockStart: {
            contentBlockIndex: 0,
            start: {
              toolUse: { toolUseId: 'tool-use-id', name: 'test-tool' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: '{"value":' } },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: '"Sparkle Day"}' } },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockStop: { contentBlockIndex: 0 },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'tool_use',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      tools: [
        {
          type: 'function',
          name: 'test-tool',
          parameters: {
            type: 'object',
            properties: { value: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      toolChoice: { type: 'tool', toolName: 'test-tool' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "argsTextDelta": "{"value":",
          "toolCallId": "tool-use-id",
          "toolCallType": "function",
          "toolName": "test-tool",
          "type": "tool-call-delta",
        },
        {
          "argsTextDelta": ""Sparkle Day"}",
          "toolCallId": "tool-use-id",
          "toolCallType": "function",
          "toolName": "test-tool",
          "type": "tool-call-delta",
        },
        {
          "args": "{"value":"Sparkle Day"}",
          "toolCallId": "tool-use-id",
          "toolCallType": "function",
          "toolName": "test-tool",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should stream parallel tool calls', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockStart: {
            contentBlockIndex: 0,
            start: {
              toolUse: { toolUseId: 'tool-use-id-1', name: 'test-tool-1' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: '{"value1":' } },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockStart: {
            contentBlockIndex: 1,
            start: {
              toolUse: { toolUseId: 'tool-use-id-2', name: 'test-tool-2' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { toolUse: { input: '{"value2":' } },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { toolUse: { input: '"Sparkle Day"}' } },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { toolUse: { input: '"Sparkle Day"}' } },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockStop: { contentBlockIndex: 0 },
        }) + '\n',
        JSON.stringify({
          contentBlockStop: { contentBlockIndex: 1 },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'tool_use',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      tools: [
        {
          type: 'function',
          name: 'test-tool-1',
          parameters: {
            type: 'object',
            properties: { value1: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
        {
          type: 'function',
          name: 'test-tool-2',
          parameters: {
            type: 'object',
            properties: { value2: { type: 'string' } },
            required: ['value'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      toolChoice: { type: 'tool', toolName: 'test-tool' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "argsTextDelta": "{"value1":",
          "toolCallId": "tool-use-id-1",
          "toolCallType": "function",
          "toolName": "test-tool-1",
          "type": "tool-call-delta",
        },
        {
          "argsTextDelta": "{"value2":",
          "toolCallId": "tool-use-id-2",
          "toolCallType": "function",
          "toolName": "test-tool-2",
          "type": "tool-call-delta",
        },
        {
          "argsTextDelta": ""Sparkle Day"}",
          "toolCallId": "tool-use-id-2",
          "toolCallType": "function",
          "toolName": "test-tool-2",
          "type": "tool-call-delta",
        },
        {
          "argsTextDelta": ""Sparkle Day"}",
          "toolCallId": "tool-use-id-1",
          "toolCallType": "function",
          "toolName": "test-tool-1",
          "type": "tool-call-delta",
        },
        {
          "args": "{"value1":"Sparkle Day"}",
          "toolCallId": "tool-use-id-1",
          "toolCallType": "function",
          "toolName": "test-tool-1",
          "type": "tool-call",
        },
        {
          "args": "{"value2":"Sparkle Day"}",
          "toolCallId": "tool-use-id-2",
          "toolCallType": "function",
          "toolName": "test-tool-2",
          "type": "tool-call",
        },
        {
          "finishReason": "tool-calls",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should handle error stream parts', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          internalServerException: {
            message: 'Internal Server Error',
            name: 'InternalServerException',
            $fault: 'server',
            $metadata: {},
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "error": {
            "$fault": "server",
            "$metadata": {},
            "message": "Internal Server Error",
            "name": "InternalServerException",
          },
          "type": "error",
        },
        {
          "finishReason": "error",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should handle modelStreamErrorException error', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          modelStreamErrorException: {
            message: 'Model Stream Error',
            name: 'ModelStreamErrorException',
            $fault: 'server',
            $metadata: {},
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "error": {
            "$fault": "server",
            "$metadata": {},
            "message": "Model Stream Error",
            "name": "ModelStreamErrorException",
          },
          "type": "error",
        },
        {
          "finishReason": "error",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should handle throttlingException error', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          throttlingException: {
            message: 'Throttling Error',
            name: 'ThrottlingException',
            $fault: 'server',
            $metadata: {},
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "error": {
            "$fault": "server",
            "$metadata": {},
            "message": "Throttling Error",
            "name": "ThrottlingException",
          },
          "type": "error",
        },
        {
          "finishReason": "error",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should handle validationException error', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          validationException: {
            message: 'Validation Error',
            name: 'ValidationException',
            $fault: 'server',
            $metadata: {},
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "error": {
            "$fault": "server",
            "$metadata": {},
            "message": "Validation Error",
            "name": "ValidationException",
          },
          "type": "error",
        },
        {
          "finishReason": "error",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should handle failed chunk parsing', async () => {
    setupMockEventStreamHandler({
      success: false,
      errorValue: { message: 'Chunk Parsing Failed' },
    });

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "error": {
            "message": "Chunk Parsing Failed",
          },
          "type": "error",
        },
        {
          "finishReason": "error",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should pass the messages and the model', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      system: [{ text: 'System Prompt' }],
    });
  });

  it('should support guardrails', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    await model.doStream({
      prompt: TEST_PROMPT,
      providerOptions: {
        bedrock: {
          guardrailConfig: {
            guardrailIdentifier: '-1',
            guardrailVersion: '1',
            trace: 'enabled',
            streamProcessingMode: 'async',
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      system: [{ text: 'System Prompt' }],
      guardrailConfig: {
        guardrailIdentifier: '-1',
        guardrailVersion: '1',
        trace: 'enabled',
        streamProcessingMode: 'async',
      },
    });
  });

  it('should include trace information in providerMetadata', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Hello' },
          },
        }) + '\n',
        JSON.stringify({
          metadata: {
            usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
            metrics: { latencyMs: 10 },
            trace: mockTrace,
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "text": "Hello",
          "type": "text",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "bedrock": {
              "trace": {
                "guardrail": {
                  "inputAssessment": {
                    "1abcd2ef34gh": {
                      "contentPolicy": {
                        "filters": [
                          {
                            "action": "BLOCKED",
                            "confidence": "LOW",
                            "type": "INSULTS",
                          },
                        ],
                      },
                      "wordPolicy": {
                        "managedWordLists": [
                          {
                            "action": "BLOCKED",
                            "match": "<rude word>",
                            "type": "PROFANITY",
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 4,
            "outputTokens": 34,
            "totalTokens": 38,
          },
        },
      ]
    `);
  });

  it('should include response headers in rawResponse', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      headers: {
        'x-amzn-requestid': 'test-request-id',
        'x-amzn-trace-id': 'test-trace-id',
      },
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Hello' },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const result = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(result.response?.headers).toEqual({
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'content-type': 'text/event-stream',
      'x-amzn-requestid': 'test-request-id',
      'x-amzn-trace-id': 'test-trace-id',
    });
  });

  it('should properly combine headers from all sources', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      headers: {
        'x-amzn-requestid': 'test-request-id',
        'x-amzn-trace-id': 'test-trace-id',
      },
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Hello' },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const optionsHeaders = {
      'options-header': 'options-value',
      'shared-header': 'options-shared',
    };

    const model = new BedrockChatLanguageModel(modelId, {
      baseUrl: () => baseUrl,
      headers: {
        'model-header': 'model-value',
        'shared-header': 'model-shared',
      },
      fetch: injectFetchHeaders({
        'options-header': 'options-value',
        'model-header': 'model-value',
        'shared-header': 'options-shared',
        'signed-header': 'signed-value',
        authorization: 'AWS4-HMAC-SHA256...',
      }),
      generateId: () => 'test-id',
    });

    await model.doStream({
      prompt: TEST_PROMPT,
      headers: optionsHeaders,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['options-header']).toBe('options-value');
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
    expect(requestHeaders['shared-header']).toBe('options-shared');
  });

  it('should work with partial headers', async () => {
    setupMockEventStreamHandler();
    const model = new BedrockChatLanguageModel(modelId, {
      baseUrl: () => baseUrl,
      headers: {
        'model-header': 'model-value',
      },
      fetch: injectFetchHeaders({
        'model-header': 'model-value',
        'signed-header': 'signed-value',
        authorization: 'AWS4-HMAC-SHA256...',
      }),
      generateId: () => 'test-id',
    });

    await model.doStream({
      prompt: TEST_PROMPT,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
  });

  it('should include providerOptions in the request for streaming calls', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Dummy' },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: { stopReason: 'stop_sequence' },
        }) + '\n',
      ],
    };

    await model.doStream({
      prompt: TEST_PROMPT,
      providerOptions: {
        bedrock: {
          foo: 'bar',
        },
      },
    });

    // Verify the outgoing request body includes "foo" at the top level.
    const body = await server.calls[0].requestBodyJson;
    expect(body).toMatchObject({ foo: 'bar' });
  });

  it('should include cache token usage in providerMetadata', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Hello' },
          },
        }) + '\n',
        JSON.stringify({
          metadata: {
            usage: {
              inputTokens: 4,
              outputTokens: 34,
              totalTokens: 38,
              cacheReadInputTokens: 2,
              cacheWriteInputTokens: 3,
            },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "text": "Hello",
          "type": "text",
        },
        {
          "finishReason": "stop",
          "providerMetadata": {
            "bedrock": {
              "usage": {
                "cacheWriteInputTokens": 3,
              },
            },
          },
          "type": "finish",
          "usage": {
            "cachedInputTokens": 2,
            "inputTokens": 4,
            "outputTokens": 34,
            "totalTokens": 38,
          },
        },
      ]
    `);
  });

  it('should handle system messages with cache points', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: { text: 'Hello' },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    await model.doStream({
      prompt: [
        {
          role: 'system',
          content: 'System Prompt',
          providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      system: [{ text: 'System Prompt' }, { cachePoint: { type: 'default' } }],
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
    });
  });

  it('should stream reasoning text deltas', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: {
              reasoningContent: { text: 'I am thinking' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: {
              reasoningContent: { text: ' about this problem...' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: {
              reasoningContent: { signature: 'abc123signature' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { text: 'Based on my reasoning, the answer is 42.' },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "text": "I am thinking",
          "type": "reasoning",
        },
        {
          "text": " about this problem...",
          "type": "reasoning",
        },
        {
          "providerMetadata": {
            "bedrock": {
              "signature": "abc123signature",
            },
          },
          "text": "",
          "type": "reasoning",
        },
        {
          "type": "reasoning-part-finish",
        },
        {
          "text": "Based on my reasoning, the answer is 42.",
          "type": "text",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });

  it('should stream redacted reasoning', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 0,
            delta: {
              reasoningContent: { data: 'redacted-reasoning-data' },
            },
          },
        }) + '\n',
        JSON.stringify({
          contentBlockDelta: {
            contentBlockIndex: 1,
            delta: { text: 'Here is my answer.' },
          },
        }) + '\n',
        JSON.stringify({
          messageStop: {
            stopReason: 'stop_sequence',
          },
        }) + '\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "providerMetadata": {
            "bedrock": {
              "redactedData": "redacted-reasoning-data",
            },
          },
          "text": "",
          "type": "reasoning",
        },
        {
          "type": "reasoning-part-finish",
        },
        {
          "text": "Here is my answer.",
          "type": "text",
        },
        {
          "finishReason": "stop",
          "type": "finish",
          "usage": {
            "inputTokens": undefined,
            "outputTokens": undefined,
            "totalTokens": undefined,
          },
        },
      ]
    `);
  });
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    content = [{ type: 'text', text: 'Hello, World!' }],
    usage = {
      inputTokens: 4,
      outputTokens: 34,
      totalTokens: 38,
      cacheReadInputTokens: undefined,
      cacheWriteInputTokens: undefined,
    },
    stopReason = 'stop_sequence',
    trace,
  }: {
    content?: Array<
      | { type: 'text'; text: string }
      | { type: 'thinking'; thinking: string; signature: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | BedrockReasoningContentBlock
      | BedrockRedactedReasoningContentBlock
    >;
    toolCalls?: Array<{
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }>;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cacheReadInputTokens?: number;
      cacheWriteInputTokens?: number;
    };
    stopReason?: string;
    trace?: typeof mockTrace;
    reasoningContent?:
      | BedrockReasoningContentBlock
      | BedrockRedactedReasoningContentBlock
      | Array<
          BedrockReasoningContentBlock | BedrockRedactedReasoningContentBlock
        >;
  }) {
    server.urls[generateUrl].response = {
      type: 'json-value',
      body: {
        output: {
          message: {
            role: 'assistant',
            content,
          },
        },
        usage,
        stopReason,
        ...(trace ? { trace } : {}),
      },
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: [{ type: 'text', text: 'Hello, World!' }] });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "text": "Hello, World!",
          "type": "text",
        },
      ]
    `);
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
    });

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 4,
        "outputTokens": 34,
        "totalTokens": 38,
      }
    `);
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({ stopReason: 'stop_sequence' });

    const { finishReason } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({ stopReason: 'eos' });

    const { finishReason } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('unknown');
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      system: [{ text: 'System Prompt' }],
    });
  });

  it('should pass settings', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 100,
      temperature: 0.5,
      topP: 0.5,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      inferenceConfig: {
        maxOutputTokens: 100,
        temperature: 0.5,
        topP: 0.5,
      },
    });
  });

  it('should support guardrails', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        bedrock: {
          guardrailConfig: {
            guardrailIdentifier: '-1',
            guardrailVersion: '1',
            trace: 'enabled',
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      guardrailConfig: {
        guardrailIdentifier: '-1',
        guardrailVersion: '1',
        trace: 'enabled',
      },
    });
  });

  it('should include trace information in providerMetadata', async () => {
    prepareJsonResponse({ trace: mockTrace });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.providerMetadata?.bedrock.trace).toMatchObject(mockTrace);
  });

  it('should include response headers in rawResponse', async () => {
    server.urls[generateUrl].response = {
      type: 'json-value',
      headers: {
        'x-amzn-requestid': 'test-request-id',
        'x-amzn-trace-id': 'test-trace-id',
      },
      body: {
        output: {
          message: {
            role: 'assistant',
            content: [{ text: 'Testing' }],
          },
        },
        usage: {
          inputTokens: 4,
          outputTokens: 34,
          totalTokens: 38,
        },
        stopReason: 'stop_sequence',
      },
    };

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.response?.headers).toEqual({
      'x-amzn-requestid': 'test-request-id',
      'x-amzn-trace-id': 'test-trace-id',
      'content-type': 'application/json',
      'content-length': '164',
    });
  });

  it('should pass tools and tool choice correctly', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      tools: [
        {
          type: 'function',
          name: 'test-tool-1',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
              param2: { type: 'number' },
            },
            required: ['param1'],
            additionalProperties: false,
          },
        },
      ],
      toolChoice: { type: 'auto' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'test-tool-1',
              description: 'A test tool',
              inputSchema: {
                json: {
                  type: 'object',
                  properties: {
                    param1: { type: 'string' },
                    param2: { type: 'number' },
                  },
                  required: ['param1'],
                  additionalProperties: false,
                },
              },
            },
          },
        ],
      },
    });
  });

  it('should properly combine headers from all sources', async () => {
    prepareJsonResponse({});

    const optionsHeaders = {
      'options-header': 'options-value',
      'shared-header': 'options-shared',
    };

    const model = new BedrockChatLanguageModel(modelId, {
      baseUrl: () => baseUrl,
      headers: {
        'model-header': 'model-value',
        'shared-header': 'model-shared',
      },
      fetch: injectFetchHeaders({
        'options-header': 'options-value',
        'model-header': 'model-value',
        'shared-header': 'options-shared',
        'signed-header': 'signed-value',
        authorization: 'AWS4-HMAC-SHA256...',
      }),
      generateId: () => 'test-id',
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      headers: optionsHeaders,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['options-header']).toBe('options-value');
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
    expect(requestHeaders['shared-header']).toBe('options-shared');
  });

  it('should work with partial headers', async () => {
    prepareJsonResponse({});

    const model = new BedrockChatLanguageModel(modelId, {
      baseUrl: () => baseUrl,
      headers: {
        'model-header': 'model-value',
      },
      fetch: injectFetchHeaders({
        'model-header': 'model-value',
        'signed-header': 'signed-value',
        authorization: 'AWS4-HMAC-SHA256...',
      }),
      generateId: () => 'test-id',
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
  });

  it('should include providerOptions in the request for generate calls', async () => {
    prepareJsonResponse({
      content: [{ type: 'text', text: 'Test generation' }],
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        bedrock: {
          foo: 'bar',
        },
      },
    });

    // Verify that the outgoing request body includes "foo" at its top level.
    const body = await server.calls[0].requestBodyJson;
    expect(body).toMatchObject({ foo: 'bar' });
  });

  it('should include cache token usage in providerMetadata', async () => {
    prepareJsonResponse({
      content: [{ type: 'text', text: 'Testing' }],
      usage: {
        inputTokens: 4,
        outputTokens: 34,
        totalTokens: 38,
        cacheReadInputTokens: 2,
        cacheWriteInputTokens: 3,
      },
    });

    const response = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(response.providerMetadata).toMatchInlineSnapshot(`
      {
        "bedrock": {
          "usage": {
            "cacheWriteInputTokens": 3,
          },
        },
      }
    `);
    expect(response.usage).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": 2,
        "inputTokens": 4,
        "outputTokens": 34,
        "totalTokens": 38,
      }
    `);
  });

  it('should handle system messages with cache points', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: [
        {
          role: 'system',
          content: 'System Prompt',
          providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      system: [{ text: 'System Prompt' }, { cachePoint: { type: 'default' } }],
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
    });
  });

  it('should extract reasoning text with signature', async () => {
    const reasoningText = 'I need to think about this problem carefully...';
    const signature = 'abc123signature';

    prepareJsonResponse({
      content: [
        {
          reasoningContent: {
            reasoningText: {
              text: reasoningText,
              signature,
            },
          },
        },
        { type: 'text', text: 'The answer is 42.' },
      ],
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": {
            "bedrock": {
              "signature": "abc123signature",
            },
          },
          "text": "I need to think about this problem carefully...",
          "type": "reasoning",
        },
        {
          "text": "The answer is 42.",
          "type": "text",
        },
      ]
    `);
  });

  it('should extract reasoning text without signature', async () => {
    const reasoningText = 'I need to think about this problem carefully...';

    prepareJsonResponse({
      content: [
        {
          reasoningContent: {
            reasoningText: {
              text: reasoningText,
            },
          },
        },
        { type: 'text', text: 'The answer is 42.' },
      ],
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "text": "I need to think about this problem carefully...",
          "type": "reasoning",
        },
        {
          "text": "The answer is 42.",
          "type": "text",
        },
      ]
    `);
  });

  it('should extract redacted reasoning', async () => {
    prepareJsonResponse({
      content: [
        {
          reasoningContent: {
            redactedReasoning: {
              data: 'redacted-reasoning-data',
            },
          },
        },
        { type: 'text', text: 'The answer is 42.' },
      ],
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": {
            "bedrock": {
              "redactedData": "redacted-reasoning-data",
            },
          },
          "text": "",
          "type": "reasoning",
        },
        {
          "text": "The answer is 42.",
          "type": "text",
        },
      ]
    `);
  });

  it('should handle multiple reasoning blocks', async () => {
    prepareJsonResponse({
      content: [
        {
          reasoningContent: {
            reasoningText: {
              text: 'First reasoning block',
              signature: 'sig1',
            },
          },
        },
        {
          reasoningContent: {
            redactedReasoning: {
              data: 'redacted-data',
            },
          },
        },
        { type: 'text', text: 'The answer is 42.' },
      ],
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "providerMetadata": {
            "bedrock": {
              "signature": "sig1",
            },
          },
          "text": "First reasoning block",
          "type": "reasoning",
        },
        {
          "providerMetadata": {
            "bedrock": {
              "redactedData": "redacted-data",
            },
          },
          "text": "",
          "type": "reasoning",
        },
        {
          "text": "The answer is 42.",
          "type": "text",
        },
      ]
    `);
  });
});
