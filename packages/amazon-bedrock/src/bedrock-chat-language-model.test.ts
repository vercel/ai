import { LanguageModelV1Prompt } from '@ai-sdk/provider';
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

const TEST_PROMPT: LanguageModelV1Prompt = [
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

const model = new BedrockChatLanguageModel(
  modelId,
  {},
  {
    baseUrl: () => baseUrl,
    headers: {},
    fetch: fakeFetchWithAuth,
    generateId: () => 'test-id',
  },
);

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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 34 },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"value":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-use-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-1',
        toolCallType: 'function',
        toolName: 'test-tool-1',
        argsTextDelta: '{"value1":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-2',
        argsTextDelta: '{"value2":',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-2',
        argsTextDelta: '"Sparkle Day"}',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'tool-use-id-1',
        toolCallType: 'function',
        toolName: 'test-tool-1',
        argsTextDelta: '"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-use-id-1',
        toolCallType: 'function',
        toolName: 'test-tool-1',
        args: '{"value1":"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'tool-use-id-2',
        toolCallType: 'function',
        toolName: 'test-tool-2',
        args: '{"value2":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const result = await convertReadableStreamToArray(stream);
    expect(result).toStrictEqual([
      {
        type: 'error',
        error: {
          message: 'Internal Server Error',
          name: 'InternalServerException',
          $fault: 'server',
          $metadata: {},
        },
      },
      {
        finishReason: 'error',
        type: 'finish',
        usage: {
          completionTokens: NaN,
          promptTokens: NaN,
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const result = await convertReadableStreamToArray(stream);
    expect(result).toStrictEqual([
      {
        type: 'error',
        error: {
          message: 'Model Stream Error',
          name: 'ModelStreamErrorException',
          $fault: 'server',
          $metadata: {},
        },
      },
      {
        finishReason: 'error',
        type: 'finish',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const result = await convertReadableStreamToArray(stream);
    expect(result).toStrictEqual([
      {
        type: 'error',
        error: {
          message: 'Throttling Error',
          name: 'ThrottlingException',
          $fault: 'server',
          $metadata: {},
        },
      },
      {
        finishReason: 'error',
        type: 'finish',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const result = await convertReadableStreamToArray(stream);
    expect(result).toStrictEqual([
      {
        type: 'error',
        error: {
          message: 'Validation Error',
          name: 'ValidationException',
          $fault: 'server',
          $metadata: {},
        },
      },
      {
        finishReason: 'error',
        type: 'finish',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
  });

  it('should handle failed chunk parsing', async () => {
    setupMockEventStreamHandler({
      success: false,
      errorValue: { message: 'Chunk Parsing Failed' },
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });
    const result = await convertReadableStreamToArray(stream);
    expect(result).toStrictEqual([
      {
        type: 'error',
        error: { message: 'Chunk Parsing Failed' },
      },
      {
        finishReason: 'error',
        type: 'finish',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
  });

  it('should pass the messages and the model', async () => {
    setupMockEventStreamHandler();
    server.urls[streamUrl].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
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

    expect(await server.calls[0].requestBody).toMatchObject({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 34 },
        providerMetadata: {
          bedrock: {
            trace: mockTrace,
          },
        },
      },
    ]);
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

    const response = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.rawResponse?.headers).toEqual({
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

    const model = new BedrockChatLanguageModel(
      modelId,
      {},
      {
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
      },
    );

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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
    const model = new BedrockChatLanguageModel(
      modelId,
      {},
      {
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
      },
    );

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        bedrock: {
          foo: 'bar',
        },
      },
    });

    // Verify the outgoing request body includes "foo" at the top level.
    const body = await server.calls[0].requestBody;
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 34 },
        providerMetadata: {
          bedrock: {
            usage: {
              cacheReadInputTokens: 2,
              cacheWriteInputTokens: 3,
            },
          },
        },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: [
        {
          role: 'system',
          content: 'System Prompt',
          providerMetadata: { bedrock: { cachePoint: { type: 'default' } } },
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });

    const requestBody = await server.calls[0].requestBody;
    expect(requestBody).toMatchObject({
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'reasoning', textDelta: 'I am thinking' },
      { type: 'reasoning', textDelta: ' about this problem...' },
      { type: 'reasoning-signature', signature: 'abc123signature' },
      {
        type: 'text-delta',
        textDelta: 'Based on my reasoning, the answer is 42.',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'redacted-reasoning', data: 'redacted-reasoning-data' },
      { type: 'text-delta', textDelta: 'Here is my answer.' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
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

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: { inputTokens: 4, outputTokens: 34, totalTokens: 38 },
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 4,
      completionTokens: 34,
    });
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({ stopReason: 'stop_sequence' });

    const { finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({ stopReason: 'eos' });

    const { finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('unknown');
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      system: [{ text: 'System Prompt' }],
    });
  });

  it('should pass settings', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      maxTokens: 100,
      temperature: 0.5,
      topP: 0.5,
    });

    expect(await server.calls[0].requestBody).toMatchObject({
      inferenceConfig: {
        maxTokens: 100,
        temperature: 0.5,
        topP: 0.5,
      },
    });
  });

  it('should pass tool specification in object-tool mode', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'object-tool',
        tool: {
          name: 'test-tool',
          type: 'function',
          parameters: {
            type: 'object',
            properties: {
              property1: { type: 'string' },
              property2: { type: 'number' },
            },
            required: ['property1', 'property2'],
            additionalProperties: false,
          },
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toMatchObject({
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'test-tool',
              inputSchema: {
                json: {
                  type: 'object',
                  properties: {
                    property1: { type: 'string' },
                    property2: { type: 'number' },
                  },
                  required: ['property1', 'property2'],
                  additionalProperties: false,
                },
              },
            },
          },
        ],
      },
    });
  });

  it('should support guardrails', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        bedrock: {
          guardrailConfig: {
            guardrailIdentifier: '-1',
            guardrailVersion: '1',
            trace: 'enabled',
          },
        },
      },
    });

    expect(await server.calls[0].requestBody).toMatchObject({
      guardrailConfig: {
        guardrailIdentifier: '-1',
        guardrailVersion: '1',
        trace: 'enabled',
      },
    });
  });

  it('should include trace information in providerMetadata', async () => {
    prepareJsonResponse({ trace: mockTrace });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.providerMetadata?.bedrock.trace).toMatchObject(mockTrace);
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

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.rawResponse?.headers).toEqual({
      'x-amzn-requestid': 'test-request-id',
      'x-amzn-trace-id': 'test-trace-id',
      'content-type': 'application/json',
      'content-length': '164',
    });
  });

  it('should pass tools and tool choice correctly', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
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
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toMatchObject({
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

    const model = new BedrockChatLanguageModel(
      modelId,
      {},
      {
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
      },
    );

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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

    const model = new BedrockChatLanguageModel(
      modelId,
      {},
      {
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
      },
    );

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      providerMetadata: {
        bedrock: {
          foo: 'bar',
        },
      },
    });

    // Verify that the outgoing request body includes "foo" at its top level.
    const body = await server.calls[0].requestBody;
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
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.providerMetadata).toEqual({
      bedrock: {
        usage: {
          cacheReadInputTokens: 2,
          cacheWriteInputTokens: 3,
        },
      },
    });
    expect(response.usage).toEqual({
      promptTokens: 4,
      completionTokens: 34,
    });
  });

  it('should handle system messages with cache points', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: [
        {
          role: 'system',
          content: 'System Prompt',
          providerMetadata: { bedrock: { cachePoint: { type: 'default' } } },
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });

    const requestBody = await server.calls[0].requestBody;
    expect(requestBody).toMatchObject({
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
              signature: signature,
            },
          },
        },
        { type: 'text', text: 'The answer is 42.' },
      ],
    });

    const { reasoning, text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('The answer is 42.');
    expect(reasoning).toStrictEqual([
      {
        type: 'text',
        text: reasoningText,
        signature: signature,
      },
    ]);
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

    const { reasoning, text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('The answer is 42.');
    expect(reasoning).toStrictEqual([
      {
        type: 'text',
        text: reasoningText,
      },
    ]);
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

    const { reasoning, text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('The answer is 42.');
    expect(reasoning).toStrictEqual([
      {
        type: 'redacted',
        data: 'redacted-reasoning-data',
      },
    ]);
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

    const { reasoning, text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('The answer is 42.');
    expect(reasoning).toStrictEqual([
      {
        type: 'text',
        text: 'First reasoning block',
        signature: 'sig1',
      },
      {
        type: 'redacted',
        data: 'redacted-data',
      },
    ]);
  });
});
