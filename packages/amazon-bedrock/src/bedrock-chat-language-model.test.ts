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
import { anthropicTools, prepareTools } from '@ai-sdk/anthropic/internal';
import { z } from 'zod/v4';

const mockPrepareAnthropicTools = vi.mocked(prepareTools);

vi.mock('@ai-sdk/anthropic/internal', async importOriginal => {
  const original =
    await importOriginal<typeof import('@ai-sdk/anthropic/internal')>();
  return {
    ...original,
    prepareTools: vi.fn(),
    anthropicTools: {
      ...original.anthropicTools,
      bash_20241022: (args: any) => ({
        type: 'provider-defined',
        id: 'anthropic.bash_20241022',
        name: 'bash',
        args,
        inputSchema: z.object({
          command: z.string(),
          restart: z.boolean().optional(),
        }),
      }),
    },
  };
});

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
const anthropicModelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0'; // Define at top level
const baseUrl = 'https://bedrock-runtime.us-east-1.amazonaws.com';

const streamUrl = `${baseUrl}/model/${encodeURIComponent(
  modelId,
)}/converse-stream`;
const generateUrl = `${baseUrl}/model/${encodeURIComponent(modelId)}/converse`;
const anthropicGenerateUrl = `${baseUrl}/model/${encodeURIComponent(
  anthropicModelId,
)}/converse`;

const server = createTestServer({
  [generateUrl]: {},
  [streamUrl]: {
    response: {
      type: 'stream-chunks',
      chunks: [],
    },
  },
  // Configure the server for the Anthropic model from the start
  [anthropicGenerateUrl]: {},
});

beforeEach(() => {
  // Reset stream chunks for the default model
  server.urls[streamUrl].response = {
    type: 'stream-chunks',
    chunks: [],
  };
  // Reset the response for the anthropic model to a default empty state
  server.urls[anthropicGenerateUrl].response = {
    type: 'json-value',
    body: {},
  };
  mockPrepareAnthropicTools.mockClear();
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
            .map(chunk => {
              const parsedChunk = JSON.parse(chunk);
              return {
                success: true,
                value: parsedChunk,
                rawValue: parsedChunk,
              };
            });
        }
        const headers = Object.fromEntries<string>([...response.headers]);

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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
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
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": ", ",
          "id": "1",
          "type": "text-delta",
        },
        {
          "id": "2",
          "type": "text-start",
        },
        {
          "delta": "World!",
          "id": "2",
          "type": "text-delta",
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
          inputSchema: {
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "tool-use-id",
          "toolName": "test-tool",
          "type": "tool-input-start",
        },
        {
          "delta": "{"value":",
          "id": "tool-use-id",
          "type": "tool-input-delta",
        },
        {
          "delta": ""Sparkle Day"}",
          "id": "tool-use-id",
          "type": "tool-input-delta",
        },
        {
          "id": "tool-use-id",
          "type": "tool-input-end",
        },
        {
          "input": "{"value":"Sparkle Day"}",
          "toolCallId": "tool-use-id",
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
          inputSchema: {
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
          inputSchema: {
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "tool-use-id-1",
          "toolName": "test-tool-1",
          "type": "tool-input-start",
        },
        {
          "delta": "{"value1":",
          "id": "tool-use-id-1",
          "type": "tool-input-delta",
        },
        {
          "id": "tool-use-id-2",
          "toolName": "test-tool-2",
          "type": "tool-input-start",
        },
        {
          "delta": "{"value2":",
          "id": "tool-use-id-2",
          "type": "tool-input-delta",
        },
        {
          "delta": ""Sparkle Day"}",
          "id": "tool-use-id-2",
          "type": "tool-input-delta",
        },
        {
          "delta": ""Sparkle Day"}",
          "id": "tool-use-id-1",
          "type": "tool-input-delta",
        },
        {
          "id": "tool-use-id-1",
          "type": "tool-input-end",
        },
        {
          "input": "{"value1":"Sparkle Day"}",
          "toolCallId": "tool-use-id-1",
          "toolName": "test-tool-1",
          "type": "tool-call",
        },
        {
          "id": "tool-use-id-2",
          "type": "tool-input-end",
        },
        {
          "input": "{"value2":"Sparkle Day"}",
          "toolCallId": "tool-use-id-2",
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
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
      includeRawChunks: false,
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "0",
          "type": "reasoning-start",
        },
        {
          "delta": "I am thinking",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "delta": " about this problem...",
          "id": "0",
          "type": "reasoning-delta",
        },
        {
          "delta": "",
          "id": "0",
          "providerMetadata": {
            "bedrock": {
              "signature": "abc123signature",
            },
          },
          "type": "reasoning-delta",
        },
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": "Based on my reasoning, the answer is 42.",
          "id": "1",
          "type": "text-delta",
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
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "delta": "",
          "id": "0",
          "providerMetadata": {
            "bedrock": {
              "redactedData": "redacted-reasoning-data",
            },
          },
          "type": "reasoning-delta",
        },
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": "Here is my answer.",
          "id": "1",
          "type": "text-delta",
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

  it('should include raw chunks when includeRawChunks is true', async () => {
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

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "rawValue": {
            "contentBlockDelta": {
              "contentBlockIndex": 0,
              "delta": {
                "text": "Hello",
              },
            },
          },
          "type": "raw",
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
          "rawValue": {
            "messageStop": {
              "stopReason": "stop_sequence",
            },
          },
          "type": "raw",
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

  it('should transform reasoningConfig to thinking in stream requests', async () => {
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
      prompt: TEST_PROMPT,
      maxOutputTokens: 100,
      includeRawChunks: false,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            type: 'enabled',
            budgetTokens: 2000,
          },
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;

    // Should contain thinking in additionalModelRequestFields
    expect(requestBody).toMatchObject({
      additionalModelRequestFields: {
        thinking: {
          type: 'enabled',
          budget_tokens: 2000,
        },
      },
      inferenceConfig: {
        maxTokens: 2100,
      },
    });

    // Should NOT contain reasoningConfig at the top level
    expect(requestBody).not.toHaveProperty('reasoningConfig');
  });

  it('should handle JSON response format in streaming', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [
        JSON.stringify({
          contentBlockStart: {
            contentBlockIndex: 0,
            start: {
              toolUse: { toolUseId: 'json-tool-id', name: 'json' },
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
            delta: { toolUse: { input: '"test"}' } },
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
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Generate JSON' }] },
      ],
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
        },
      },
      includeRawChunks: false,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "type": "stream-start",
          "warnings": [],
        },
        {
          "id": "0",
          "type": "text-start",
        },
        {
          "delta": "{"value":"test"}",
          "id": "0",
          "type": "text-delta",
        },
        {
          "id": "0",
          "type": "text-end",
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
      topK: 1,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      inferenceConfig: {
        maxTokens: 100,
        temperature: 0.5,
        topP: 0.5,
        topK: 1,
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
          inputSchema: {
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

  it('should handle Anthropic provider-defined tools', async () => {
    mockPrepareAnthropicTools.mockReturnValue({
      tools: [{ name: 'bash', type: 'bash_20241022' }],
      toolChoice: { type: 'auto' },
      toolWarnings: [],
      betas: new Set(['computer-use-2024-10-22']),
    });

    // Set up the mock response for this specific URL and test case
    server.urls[anthropicGenerateUrl].response = {
      type: 'json-value',
      body: {
        output: {
          message: {
            role: 'assistant',
            content: [
              {
                toolUse: {
                  toolUseId: 'tool-use-id',
                  name: 'bash',
                  input: { command: 'ls -l' },
                },
              },
            ],
          },
        },
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        stopReason: 'tool_use',
      },
    };

    const anthropicModel = new BedrockChatLanguageModel(anthropicModelId, {
      baseUrl: () => baseUrl,
      headers: {},
      // No fetch property: defaults to global fetch, which is mocked by the test server.
      generateId: () => 'test-id',
    });

    const result = await anthropicModel.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined',
          id: 'anthropic.bash_20241022',
          name: 'bash',
          args: {},
        },
      ],
      toolChoice: { type: 'auto' },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    const requestHeaders = server.calls[0].requestHeaders;

    expect(requestHeaders['anthropic-beta']).toBe('computer-use-2024-10-22');

    expect(requestBody.additionalModelRequestFields).toEqual({
      tool_choice: { type: 'auto' },
    });

    expect(requestBody.toolConfig).toBeDefined();
    expect(requestBody.toolConfig.tools).toHaveLength(1);
    expect(requestBody.toolConfig.tools[0].toolSpec.name).toBe('bash');
    expect(requestBody.toolConfig.tools[0].toolSpec.inputSchema.json).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        command: { type: 'string' },
        restart: { type: 'boolean' },
      },
      required: ['command'],
      additionalProperties: false,
    });

    expect(result.warnings).toEqual([]);
    expect(result.content).toMatchInlineSnapshot(`
      [
        {
          "input": "{"command":"ls -l"}",
          "toolCallId": "tool-use-id",
          "toolName": "bash",
          "type": "tool-call",
        },
      ]
    `);
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

  it('should transform reasoningConfig to thinking in additionalModelRequestFields', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 100,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            type: 'enabled',
            budgetTokens: 2000,
          },
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;

    // Should contain thinking in additionalModelRequestFields
    expect(requestBody).toMatchObject({
      additionalModelRequestFields: {
        thinking: {
          type: 'enabled',
          budget_tokens: 2000,
        },
      },
      inferenceConfig: {
        maxTokens: 2100,
      },
    });

    // Should NOT contain reasoningConfig at the top level
    expect(requestBody).not.toHaveProperty('reasoningConfig');
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

  it('should omit toolConfig and filter tool content when conversation has tool calls but no active tools', async () => {
    prepareJsonResponse({});

    const conversationWithToolCalls: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is the weather in Toronto?' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'weather',
            input: { city: 'Toronto' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-1',
            toolName: 'weather',
            output: {
              type: 'text',
              value: 'The weather in Toronto is 20°C.',
            },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Now give me a summary.' }],
      },
    ];

    const result = await model.doGenerate({
      prompt: conversationWithToolCalls,
      tools: [],
    });

    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody.toolConfig).toMatchInlineSnapshot(`undefined`);

    expect(requestBody.messages).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "What is the weather in Toronto?",
            },
            {
              "text": "Now give me a summary.",
            },
          ],
          "role": "user",
        },
      ]
    `);

    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "details": "Tool calls and results removed from conversation because Bedrock does not support tool content without active tools.",
          "setting": "toolContent",
          "type": "unsupported-setting",
        },
      ]
    `);
  });

  it('should handle JSON response format with schema', async () => {
    prepareJsonResponse({
      content: [
        {
          type: 'tool_use',
          id: 'json-tool-id',
          name: 'json',
          input: {
            recipe: { name: 'Lasagna', ingredients: ['pasta', 'cheese'] },
          },
        },
      ],
    });

    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Generate a recipe' }],
        },
      ],
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            recipe: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                ingredients: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'ingredients'],
            },
          },
          required: ['recipe'],
        },
      },
    });

    expect(result.content).toMatchInlineSnapshot(`[]`);

    expect(result.providerMetadata?.bedrock?.isJsonResponseFromTool).toBe(true);

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.toolConfig.tools).toHaveLength(1);
    expect(requestBody.toolConfig.tools[0].toolSpec.name).toBe('json');
    expect(requestBody.toolConfig.tools[0].toolSpec.description).toBe(
      'Respond with a JSON object.',
    );
    expect(requestBody.toolConfig.toolChoice).toEqual({
      tool: { name: 'json' },
    });
  });

  it('should warn when tools are provided with JSON response format', async () => {
    prepareJsonResponse({
      content: [
        {
          type: 'tool_use',
          id: 'json-tool-id',
          name: 'json',
          input: { value: 'test' },
        },
      ],
    });

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Test' }] }],
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
        },
      },
      tools: [
        {
          type: 'function',
          name: 'test-tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(result.warnings).toEqual([
      {
        type: 'other',
        message:
          'JSON response format does not support tools. The provided tools are ignored.',
      },
    ]);
  });

  it('should handle unsupported response format types', async () => {
    prepareJsonResponse({});

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: { type: 'xml' as any },
    });

    expect(result.warnings).toEqual([
      {
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'Only text and json response formats are supported.',
      },
    ]);
  });

  it('should omit toolConfig when conversation has tool calls but toolChoice is none', async () => {
    prepareJsonResponse({});

    const conversationWithToolCalls: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is the weather in Toronto?' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'tool-call-1',
            toolName: 'weather',
            input: { city: 'Toronto' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-1',
            toolName: 'weather',
            output: {
              type: 'text',
              value: 'The weather in Toronto is 20°C.',
            },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Now give me a summary.' }],
      },
    ];

    await model.doGenerate({
      prompt: conversationWithToolCalls,
      tools: [
        {
          type: 'function',
          name: 'weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
            $schema: 'http://json-schema.org/draft-07/schema#',
          },
        },
      ],
      toolChoice: { type: 'none' },
    });

    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody.toolConfig).toMatchInlineSnapshot(`undefined`);
  });
});
