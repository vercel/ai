import {
  APICallError,
  TypeValidationError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { DeepInfraChatLanguageModel } from './deepinfra-chat-language-model';
import { createDeepInfra } from './deepinfra-provider';

describe('DeepInfraChatLanguageModel', () => {
  describe('usage calculation', () => {
    it('should fix incorrect completion_tokens for gemini/gemma models when reasoning_tokens > completion_tokens', async () => {
      const responseBody = {
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-2-9b-it',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        // This is the problematic usage data from DeepInfra for gemini/gemma models
        usage: {
          prompt_tokens: 19,
          completion_tokens: 84,
          total_tokens: 1184,
          prompt_tokens_details: null,
          completion_tokens_details: {
            reasoning_tokens: 1081,
          },
        },
      };

      const model = new DeepInfraChatLanguageModel('google/gemma-2-9b-it', {
        provider: 'deepinfra.chat',
        url: () => 'https://api.deepinfra.com/v1/openai/chat/completions',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ) as any,
      });

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Test prompt' }],
          },
        ],
      });

      // The usage should be corrected:
      // - completion_tokens should be text + reasoning: 84 + 1081 = 1165
      // - text tokens should be 84 (the original completion_tokens value)
      // - reasoning tokens should be 1081
      expect(result.usage.outputTokens.total).toBe(1165); // 84 + 1081
      expect(result.usage.outputTokens.text).toBe(84);
      expect(result.usage.outputTokens.reasoning).toBe(1081);
    });

    it('should not modify usage for non-gemini models with correct data', async () => {
      const responseBody = {
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 18,
          completion_tokens: 475,
          total_tokens: 493,
          prompt_tokens_details: null,
        },
      };

      const model = new DeepInfraChatLanguageModel(
        'mistralai/Mixtral-8x7B-Instruct-v0.1',
        {
          provider: 'deepinfra.chat',
          url: () => 'https://api.deepinfra.com/v1/openai/chat/completions',
          headers: () => ({ Authorization: 'Bearer test-key' }),
          fetch: vi.fn().mockResolvedValue(
            new Response(JSON.stringify(responseBody), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          ) as any,
        },
      );

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Test prompt' }],
          },
        ],
      });

      expect(result.usage.outputTokens.total).toBe(475);
      expect(result.usage.outputTokens.text).toBe(475);
      expect(result.usage.outputTokens.reasoning).toBe(0);
    });
  });
});

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const chatUrl = 'https://api.deepinfra.com/v1/openai/chat/completions';
const server = createTestServer({ [chatUrl]: {} });

const contextLengthMessage =
  "This model's maximum context length is 40960 tokens. However, you requested 50000 tokens.";

function deepInfraFrame(errorType: string, errorMessage: string) {
  return `data: ${JSON.stringify({
    error_type: errorType,
    error_message: errorMessage,
  })}\n\n`;
}

function prepareStreamResponse(chunks: string[]) {
  server.urls[chatUrl].response = { type: 'stream-chunks', chunks };
}

async function streamParts(
  model = createDeepInfra({ apiKey: 'test-key' }).chatModel('test-model'),
) {
  const { stream } = await model.doStream({ prompt });
  return convertReadableStreamToArray(stream);
}

const roleDelta =
  'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n';

describe('DeepInfraChatLanguageModel stream errors', () => {
  it('should normalize the DeepInfra error_type/error_message frame', async () => {
    prepareStreamResponse([
      roleDelta,
      deepInfraFrame(
        'validation_error',
        JSON.stringify({ error: { message: contextLengthMessage } }),
      ),
    ]);

    const parts = await streamParts();

    const errorParts = parts.filter(part => part.type === 'error');
    expect(errorParts).toEqual([
      {
        type: 'error',
        error: {
          message: contextLengthMessage,
          type: 'validation_error',
          param: undefined,
          code: 400,
        },
      },
    ]);
    expect(TypeValidationError.isInstance(errorParts[0].error)).toBe(false);

    const finish = parts.find(part => part.type === 'finish');
    expect(finish?.finishReason.unified).toBe('error');
  });

  it('should normalize the frame when the model is constructed directly', async () => {
    prepareStreamResponse([
      deepInfraFrame(
        'validation_error',
        JSON.stringify({ error: { message: contextLengthMessage } }),
      ),
    ]);

    const parts = await streamParts(
      new DeepInfraChatLanguageModel('test-model', {
        provider: 'deepinfra.chat',
        url: () => chatUrl,
        headers: () => ({ Authorization: 'Bearer test-key' }),
      }),
    );

    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: {
        message: contextLengthMessage,
        type: 'validation_error',
        param: undefined,
        code: 400,
      },
    });
  });

  it('should prefer the nested error code and type when present', async () => {
    prepareStreamResponse([
      deepInfraFrame(
        'validation_error',
        JSON.stringify({
          error: {
            message: contextLengthMessage,
            type: 'invalid_request_error',
            code: 'context_length_exceeded',
          },
        }),
      ),
    ]);

    const parts = await streamParts();

    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: {
        message: contextLengthMessage,
        type: 'invalid_request_error',
        param: undefined,
        code: 'context_length_exceeded',
      },
    });
  });

  it.each([
    ['not json', 'upstream exploded'],
    ['json in an unexpected shape', JSON.stringify({ detail: 'nope' })],
  ])(
    'should fall back to the raw error_message when it is %s',
    async (_, errorMessage) => {
      prepareStreamResponse([deepInfraFrame('validation_error', errorMessage)]);

      const parts = await streamParts();

      expect(parts.find(part => part.type === 'error')).toEqual({
        type: 'error',
        error: {
          message: errorMessage,
          type: 'validation_error',
          param: undefined,
          code: 400,
        },
      });
    },
  );

  it('should leave code undefined for non-validation error types', async () => {
    prepareStreamResponse([
      deepInfraFrame(
        'internal_error',
        JSON.stringify({ error: { message: 'Internal server error' } }),
      ),
    ]);

    const parts = await streamParts();

    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: {
        message: 'Internal server error',
        type: 'internal_error',
        param: undefined,
        code: undefined,
      },
    });
  });

  it('should pass standard OpenAI-style error frames through unchanged', async () => {
    prepareStreamResponse([
      `data: ${JSON.stringify({ error: { message: 'Rate limited', code: '429' } })}\n\n`,
    ]);

    const parts = await streamParts();

    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: { message: 'Rate limited', code: '429' },
    });
  });

  it('should stream normal content and fix gemini usage', async () => {
    prepareStreamResponse([
      roleDelta,
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":"stop"}],"usage":{"prompt_tokens":19,"completion_tokens":84,"total_tokens":1184,"completion_tokens_details":{"reasoning_tokens":1081}}}\n\n',
      'data: [DONE]\n\n',
    ]);

    const parts = await streamParts();

    expect(parts.some(part => part.type === 'error')).toBe(false);
    expect(
      parts
        .filter(part => part.type === 'text-delta')
        .map(part => part.delta)
        .join(''),
    ).toBe('Hi');

    const finish = parts.find(part => part.type === 'finish');
    expect(finish?.finishReason.unified).toBe('stop');
    expect(finish?.usage.outputTokens).toEqual({
      total: 1165,
      text: 84,
      reasoning: 1081,
    });
  });

  it('should keep error normalization after workflow serialize/deserialize', async () => {
    const model = createDeepInfra({ apiKey: 'test-key' }).chatModel(
      'test-model',
    ) as DeepInfraChatLanguageModel;
    const serialized = DeepInfraChatLanguageModel[WORKFLOW_SERIALIZE](
      model,
    ) as any;
    expect(serialized.config.errorStructure).toBeUndefined();

    // Serialization drops functions; supply url/headers like a runtime would.
    const restored = DeepInfraChatLanguageModel[WORKFLOW_DESERIALIZE]({
      modelId: serialized.modelId,
      config: {
        ...serialized.config,
        url: () => chatUrl,
        headers: () => serialized.config.headers,
      },
    });

    prepareStreamResponse([
      deepInfraFrame(
        'validation_error',
        JSON.stringify({ error: { message: contextLengthMessage } }),
      ),
    ]);

    const parts = await streamParts(restored);

    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: {
        message: contextLengthMessage,
        type: 'validation_error',
        param: undefined,
        code: 400,
      },
    });
  });
});

describe('DeepInfraChatLanguageModel HTTP errors', () => {
  const model = createDeepInfra({ apiKey: 'test-key' }).chatModel('test-model');

  async function generateError(): Promise<any> {
    try {
      await model.doGenerate({ prompt });
    } catch (error) {
      return error;
    }
    throw new Error('expected doGenerate to throw');
  }

  it('should surface the message from an OpenAI-style error body', async () => {
    server.urls[chatUrl].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: { message: 'Bad request', type: 'invalid_request_error' },
      }),
    };

    const error = await generateError();

    expect(APICallError.isInstance(error)).toBe(true);
    expect(error.message).toBe('Bad request');
    expect(error.statusCode).toBe(400);
  });

  it('should surface the unwrapped message from a DeepInfra-native error body', async () => {
    server.urls[chatUrl].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error_type: 'validation_error',
        error_message: JSON.stringify({
          error: { message: contextLengthMessage },
        }),
      }),
    };

    const error = await generateError();

    expect(APICallError.isInstance(error)).toBe(true);
    expect(error.message).toBe(contextLengthMessage);
    expect(error.statusCode).toBe(400);
    expect(error.data).toEqual({
      error: {
        message: contextLengthMessage,
        type: 'validation_error',
        param: undefined,
        code: 400,
      },
    });
  });
});
