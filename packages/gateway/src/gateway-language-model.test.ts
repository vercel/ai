import type {
  LanguageModelV2Prompt,
  LanguageModelV2FilePart,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { GatewayLanguageModel } from './gateway-language-model';
import type { GatewayConfig } from './gateway-config';
import { vi } from 'vitest';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const createTestModel = (
  config: Partial<
    GatewayConfig & { o11yHeaders?: Record<string, string> }
  > = {},
) => {
  return new GatewayLanguageModel(
    'test-model',
    {
      provider: 'test-provider',
      baseURL: 'https://api.test.com',
      headers: () => ({
        Authorization: 'Bearer test-token',
      }),
      fetch: globalThis.fetch,
      o11yHeaders: config.o11yHeaders || {},
      ...config,
    },
    async () => ({
      provider: 'test-provider',
      specificationVersion: 'v2',
      modelId: 'test-model',
    }),
  );
};

describe('GatewayLanguageModel', () => {
  const server = createTestServer({
    'https://api.test.com/language-model': {},
  });

  describe('constructor', () => {
    it('should set basic properties', () => {
      const model = createTestModel();
      expect(model.modelId).toBe('test-model');
      expect(model.provider).toBe('test-provider');
      expect(model.specificationVersion).toBe('v2');
    });
  });

  describe('doGenerate', () => {
    function prepareJsonResponse({
      content = { type: 'text', text: '' },
      usage = {
        prompt_tokens: 4,
        completion_tokens: 30,
      },
      finish_reason = 'stop',
      id = 'test-id',
      created = 1711115037,
      model = 'test-model',
    } = {}) {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'json-value',
        body: {
          id,
          created,
          model,
          content,
          finish_reason,
          usage,
        },
      };
    }

    it('should pass headers correctly', async () => {
      prepareJsonResponse({ content: { type: 'text', text: 'Hello, World!' } });

      await createTestModel().doGenerate({
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Header': 'test-value',
        },
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject({
        authorization: 'Bearer test-token',
        'custom-header': 'test-value',
        'ai-language-model-specification-version': '2',
        'ai-language-model-id': 'test-model',
        'ai-language-model-streaming': 'false',
      });
    });

    it('should extract text response', async () => {
      prepareJsonResponse({ content: { type: 'text', text: 'Hello, World!' } });

      const { content } = await createTestModel().doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(content).toEqual({ type: 'text', text: 'Hello, World!' });
    });

    it('should extract usage information', async () => {
      prepareJsonResponse({
        content: { type: 'text', text: 'Test' },
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
        },
      });

      const { usage } = await createTestModel().doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 20,
      });
    });

    it('should remove abortSignal from the request body', async () => {
      prepareJsonResponse({ content: { type: 'text', text: 'Test response' } });

      const controller = new AbortController();
      const signal = controller.signal;

      await createTestModel().doGenerate({
        prompt: TEST_PROMPT,
        abortSignal: signal,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('abortSignal');
    });

    it('should pass abortSignal to fetch when provided', async () => {
      prepareJsonResponse({ content: { type: 'text', text: 'Test response' } });

      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);

      const controller = new AbortController();
      const signal = controller.signal;

      await createTestModel({
        fetch: mockFetch,
      }).doGenerate({
        prompt: TEST_PROMPT,
        abortSignal: signal,
      });

      expect(mockFetch).toHaveBeenCalled();
      const fetchCallArgs = mockFetch.mock.calls[0];
      expect(fetchCallArgs[1].signal).toBe(signal);
    });

    it('should not pass abortSignal to fetch when not provided', async () => {
      prepareJsonResponse({ content: { type: 'text', text: 'Test response' } });

      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);

      await createTestModel({
        fetch: mockFetch,
      }).doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(mockFetch).toHaveBeenCalled();
      const fetchCallArgs = mockFetch.mock.calls[0];
      expect(fetchCallArgs[1].signal).toBeUndefined();
    });

    it('should include o11y headers in the request', async () => {
      prepareJsonResponse({ content: { type: 'text', text: 'Hello, World!' } });

      const o11yHeaders = {
        'ai-o11y-deployment-id': 'test-deployment',
        'ai-o11y-environment': 'production',
        'ai-o11y-region': 'iad1',
      };

      await createTestModel({ o11yHeaders }).doGenerate({
        prompt: TEST_PROMPT,
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject(o11yHeaders);
    });

    describe('Image part encoding', () => {
      it('should not modify prompt without image parts', async () => {
        prepareJsonResponse({ content: { type: 'text', text: 'response' } });

        await createTestModel().doGenerate({
          prompt: TEST_PROMPT,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.prompt).toEqual(TEST_PROMPT);
      });

      it('should encode Uint8Array image part to base64 data URL with default mime type', async () => {
        prepareJsonResponse({ content: { type: 'text', text: 'response' } });
        const imageBytes = new Uint8Array([1, 2, 3, 4]);
        const expectedBase64 = Buffer.from(imageBytes).toString('base64');
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image:' },
              { type: 'file', data: imageBytes, mediaType: 'image/jpeg' },
            ],
          },
        ];

        await createTestModel().doGenerate({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const imagePart = requestBody.prompt[0]
          .content[1] as LanguageModelV2FilePart;

        expect(imagePart.type).toBe('file');
        expect(imagePart.data).toBe(`data:image/jpeg;base64,${expectedBase64}`);
        expect(imagePart.mediaType).toBe('image/jpeg');
      });

      it('should encode Uint8Array image part to base64 data URL with specified mime type', async () => {
        prepareJsonResponse({ content: { type: 'text', text: 'response' } });
        const imageBytes = new Uint8Array([5, 6, 7, 8]);
        const expectedBase64 = Buffer.from(imageBytes).toString('base64');
        const mimeType = 'image/png';
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [{ type: 'file', data: imageBytes, mediaType: mimeType }],
          },
        ];

        await createTestModel().doGenerate({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const imagePart = requestBody.prompt[0]
          .content[0] as LanguageModelV2FilePart;

        expect(imagePart.type).toBe('file');
        expect(imagePart.data).toBe(
          `data:${mimeType};base64,${expectedBase64}`,
        );
        expect(imagePart.mediaType).toBe(mimeType);
      });

      it('should not modify image part with URL', async () => {
        prepareJsonResponse({ content: { type: 'text', text: 'response' } });
        const imageUrl = new URL('https://example.com/image.jpg');
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Image URL:' },
              { type: 'file', data: imageUrl, mediaType: 'image/jpeg' },
            ],
          },
        ];

        await createTestModel().doGenerate({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const imagePart = requestBody.prompt[0]
          .content[1] as LanguageModelV2FilePart;

        expect(imagePart.type).toBe('file');
        expect(imagePart.data).toBe(imageUrl.toString());
      });

      it('should handle mixed content types correctly', async () => {
        prepareJsonResponse({ content: { type: 'text', text: 'response' } });
        const imageBytes = new Uint8Array([1, 2, 3, 4]);
        const expectedBase64 = Buffer.from(imageBytes).toString('base64');
        const imageUrl = new URL('https://example.com/image2.png');
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'First text.' },
              { type: 'file', data: imageBytes, mediaType: 'image/gif' },
              { type: 'text', text: 'Second text.' },
              { type: 'file', data: imageUrl, mediaType: 'image/png' },
            ],
          },
        ];

        await createTestModel().doGenerate({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const content = requestBody.prompt[0].content;

        expect(content[0]).toEqual({ type: 'text', text: 'First text.' });
        expect(content[1]).toEqual({
          type: 'file',
          data: `data:image/gif;base64,${expectedBase64}`,
          mediaType: 'image/gif',
        });
        expect(content[2]).toEqual({ type: 'text', text: 'Second text.' });
        expect(content[3]).toEqual({
          type: 'file',
          data: imageUrl.toString(),
          mediaType: 'image/png',
        });
      });
    });
  });

  describe('doStream', () => {
    function prepareStreamResponse({
      content,
      finish_reason = 'stop',
    }: {
      content: string[];
      finish_reason?: string;
    }) {
      server.urls['https://api.test.com/language-model'].response = {
        type: 'stream-chunks',
        chunks: [
          ...content.map(
            text =>
              `data: ${JSON.stringify({
                type: 'text-delta',
                textDelta: text,
              })}\n\n`,
          ),
          `data: ${JSON.stringify({
            type: 'finish',
            finishReason: finish_reason,
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
            },
          })}\n\n`,
        ],
      };
    }

    it('should stream text deltas', async () => {
      prepareStreamResponse({
        content: ['Hello', ', ', 'World!'],
      });

      const { stream } = await createTestModel().doStream({
        prompt: TEST_PROMPT,
      });

      expect(await convertReadableStreamToArray(stream)).toEqual([
        { type: 'text-delta', textDelta: 'Hello' },
        { type: 'text-delta', textDelta: ', ' },
        { type: 'text-delta', textDelta: 'World!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
          },
        },
      ]);
    });

    it('should pass streaming headers', async () => {
      prepareStreamResponse({
        content: ['Test'],
      });

      await createTestModel().doStream({
        prompt: TEST_PROMPT,
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject({
        'ai-language-model-specification-version': '2',
        'ai-language-model-id': 'test-model',
        'ai-language-model-streaming': 'true',
      });
    });

    it('should remove abortSignal from the streaming request body', async () => {
      prepareStreamResponse({
        content: ['Test content'],
      });

      const controller = new AbortController();
      const signal = controller.signal;

      await createTestModel().doStream({
        prompt: TEST_PROMPT,
        abortSignal: signal,
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('abortSignal');
    });

    it('should pass abortSignal to fetch when provided for streaming', async () => {
      prepareStreamResponse({
        content: ['Test content'],
      });

      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);

      const controller = new AbortController();
      const signal = controller.signal;

      await createTestModel({
        fetch: mockFetch,
      }).doStream({
        prompt: TEST_PROMPT,
        abortSignal: signal,
      });

      expect(mockFetch).toHaveBeenCalled();
      const fetchCallArgs = mockFetch.mock.calls[0];
      expect(fetchCallArgs[1].signal).toBe(signal);
    });

    it('should not pass abortSignal to fetch when not provided for streaming', async () => {
      prepareStreamResponse({
        content: ['Test content'],
      });

      const mockFetch = vi.fn().mockImplementation(globalThis.fetch);

      await createTestModel({
        fetch: mockFetch,
      }).doStream({
        prompt: TEST_PROMPT,
      });

      expect(mockFetch).toHaveBeenCalled();
      const fetchCallArgs = mockFetch.mock.calls[0];
      expect(fetchCallArgs[1].signal).toBeUndefined();
    });

    it('should include o11y headers in the streaming request', async () => {
      prepareStreamResponse({
        content: ['Test content'],
      });

      const o11yHeaders = {
        'ai-o11y-deployment-id': 'test-deployment',
        'ai-o11y-environment': 'production',
        'ai-o11y-region': 'iad1',
      };

      await createTestModel({ o11yHeaders }).doStream({
        prompt: TEST_PROMPT,
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject(o11yHeaders);
    });

    describe('Image part encoding', () => {
      it('should not modify prompt without image parts', async () => {
        prepareStreamResponse({ content: ['response'] });

        await createTestModel().doStream({
          prompt: TEST_PROMPT,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody.prompt).toEqual(TEST_PROMPT);
      });

      it('should encode Uint8Array image part to base64 data URL with default mime type', async () => {
        prepareStreamResponse({ content: ['response'] });
        const imageBytes = new Uint8Array([1, 2, 3, 4]);
        const expectedBase64 = Buffer.from(imageBytes).toString('base64');
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe:' },
              { type: 'file', data: imageBytes, mediaType: 'image/jpeg' },
            ],
          },
        ];

        await createTestModel().doStream({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const imagePart = requestBody.prompt[0]
          .content[1] as LanguageModelV2FilePart;

        expect(imagePart.type).toBe('file');
        expect(imagePart.data).toBe(`data:image/jpeg;base64,${expectedBase64}`);
        expect(imagePart.mediaType).toBe('image/jpeg');
      });

      it('should encode Uint8Array image part to base64 data URL with specified mime type', async () => {
        prepareStreamResponse({ content: ['response'] });
        const imageBytes = new Uint8Array([5, 6, 7, 8]);
        const expectedBase64 = Buffer.from(imageBytes).toString('base64');
        const mimeType = 'image/png';
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe:' },
              { type: 'file', data: imageBytes, mediaType: mimeType },
            ],
          },
        ];

        await createTestModel().doStream({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const imagePart = requestBody.prompt[0]
          .content[1] as LanguageModelV2FilePart;

        expect(imagePart.type).toBe('file');
        expect(imagePart.data).toBe(
          `data:${mimeType};base64,${expectedBase64}`,
        );
        expect(imagePart.mediaType).toBe(mimeType);
      });

      it('should not modify image part with URL', async () => {
        prepareStreamResponse({ content: ['response'] });
        const imageUrl = new URL('https://example.com/image.jpg');
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'URL:' },
              { type: 'file', data: imageUrl, mediaType: 'image/jpeg' },
            ],
          },
        ];

        await createTestModel().doStream({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const imagePart = requestBody.prompt[0]
          .content[1] as LanguageModelV2FilePart;

        expect(imagePart.type).toBe('file');
        expect(imagePart.data).toBe(imageUrl.toString());
        expect(imagePart.mediaType).toBe('image/jpeg');
      });

      it('should handle mixed content types correctly for streaming', async () => {
        prepareStreamResponse({ content: ['response'] });
        const imageBytes = new Uint8Array([1, 2, 3, 4]);
        const expectedBase64 = Buffer.from(imageBytes).toString('base64');
        const imageUrl = new URL('https://example.com/image2.png');
        const imagePrompt: LanguageModelV2Prompt = [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'First text.' },
              { type: 'file', data: imageBytes, mediaType: 'image/gif' },
              { type: 'text', text: 'Second text.' },
              { type: 'file', data: imageUrl, mediaType: 'image/png' },
            ],
          },
        ];

        await createTestModel().doStream({
          prompt: imagePrompt,
        });

        const requestBody = await server.calls[0].requestBodyJson;
        const content = requestBody.prompt[0].content;

        expect(content[0]).toEqual({ type: 'text', text: 'First text.' });
        expect(content[1]).toEqual({
          type: 'file',
          data: `data:image/gif;base64,${expectedBase64}`,
          mediaType: 'image/gif',
        });
        expect(content[2]).toEqual({ type: 'text', text: 'Second text.' });
        expect(content[3]).toEqual({
          type: 'file',
          data: imageUrl.toString(),
          mediaType: 'image/png',
        });
      });
    });
  });
});
