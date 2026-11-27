import fs from 'node:fs';

import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { AlibabaImageModel } from './alibaba-image-model';
import type { AlibabaImageModelOptions } from './alibaba-image-model-options';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

const server = createTestServer({
  [TEST_URL]: {},
});

const model = new AlibabaImageModel('qwen-image-3.0', {
  provider: 'alibaba.image',
  baseURL: 'https://dashscope.aliyuncs.com',
  headers: () => ({
    authorization: 'Bearer test-api-key',
  }),
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls[TEST_URL].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(`src/image/__fixtures__/${filename}.json`, 'utf8'),
    ),
  };
}

describe('AlibabaImageModel', () => {
  it('should return 1 for maxImagesPerCall', () => {
    expect(model.maxImagesPerCall).toBe(1);
  });

  it('should have correct provider name', () => {
    expect(model.provider).toBe('alibaba.image');
  });

  it('should have specificationVersion v4', () => {
    expect(model.specificationVersion).toBe('v4');
  });

  describe('doGenerate', () => {
    it('should send POST request with correct structure', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(TEST_URL);
    });

    it('should send model and prompt in correct format', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchObject({
        model: 'qwen-image-3.0',
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: 'A beautiful sunset' }],
            },
          ],
        },
        parameters: {},
      });
    });

    it('should extract generated images from response', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toMatchInlineSnapshot(`
        [
          "iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAB2GNhQlgAAYHZqdW1kYzJwYQARABCAAACqADibcQNj",
        ]
      `);
    });

    it('should include usage information', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.usage).toStrictEqual({
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      });
    });

    it('should include response metadata with timestamp and headers', async () => {
      prepareJsonFixtureResponse('alibaba-image', {
        'x-request-id': 'test-request-id',
      });

      const customModel = new AlibabaImageModel('qwen-image-3.0', {
        provider: 'alibaba.image',
        baseURL: 'https://dashscope.aliyuncs.com',
        headers: () => ({}),
      });

      const result = await customModel.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.response).toMatchObject({
        timestamp: expect.any(Date),
        modelId: 'qwen-image-3.0',
        headers: expect.objectContaining({
          'x-request-id': 'test-request-id',
        }),
      });
    });

    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonFixtureResponse('alibaba-image');
      const beforeDate = new Date();

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const afterDate = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeDate.getTime(),
      );
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
        afterDate.getTime(),
      );
      expect(result.response.modelId).toBe('qwen-image-3.0');
    });

    it('should include provider metadata', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.providerMetadata).toStrictEqual({
        alibaba: {
          images: [
            {
              image: [
                'iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAB2GNhQlgAAYHZqdW1kYzJwYQARABCAAACqADibcQNj',
              ],
              finishReason: 'stop',
            },
          ],
        },
      });
    });

    it('should pass headers', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const modelWithHeaders = new AlibabaImageModel('qwen-image-3.0', {
        provider: 'alibaba.image',
        baseURL: 'https://dashscope.aliyuncs.com',
        headers: () => ({
          authorization: 'Bearer test-api-key',
          'custom-provider-header': 'provider-header-value',
        }),
      });

      await modelWithHeaders.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: {
          'custom-request-header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should support abortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        model.doGenerate({
          prompt: 'A beautiful sunset',
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
          abortSignal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it('should pass n parameter from options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.n).toBe(2);
    });

    it('should pass n from model.doGenerate instead of parameter from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: { n: 3 } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.n).toBe(1);
    });

    it('should prefer n from options over provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 4,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: { n: 3 } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.n).toBe(4);
    });

    it('should pass seed parameter from options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: 12345,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.seed).toBe(12345);
    });

    it('should pass seed parameter from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: { seed: 54321 } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.seed).toBe(54321);
    });

    it('should prefer seed from options over provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: 11111,
        providerOptions: {
          alibaba: { seed: 22222 } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.seed).toBe(11111);
    });

    it('should pass size parameter from options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.size).toBe('1024*1024');
    });

    it('should pass size parameter from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            size: '1024*1024',
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.size).toBe('1024*1024');
    });

    it('should prefer size from options over provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            size: '512*512',
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.size).toBe('1024*1024');
    });

    it('should pass negative_prompt from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            negative_prompt: 'blurry, low quality',
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.negative_prompt).toBe(
        'blurry, low quality',
      );
    });

    it('should pass enable_thinking from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            enable_thinking: false,
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.enable_thinking).toBe(false);
    });

    it('should pass prompt_extend from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            prompt_extend: false,
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.prompt_extend).toBe(false);
    });

    it('should pass prompt_extend_model from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            prompt_extend_model: 'agent',
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.prompt_extend_model).toBe('agent');
    });

    it('should pass watermark from provider options', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          alibaba: {
            watermark: true,
          } satisfies AlibabaImageModelOptions,
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.parameters.watermark).toBe(true);
    });

    it('should return warning for unsupported aspectRatio option', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            'The aspectRatio option is not supported by the Alibaba image generation model.',
        },
      ]);
    });

    it('should return warning for unsupported mask option', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: {
          type: 'file',
          data: new Uint8Array([1, 2, 3]),
          mediaType: 'image/png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'mask',
          details:
            'The mask option is not supported by the Alibaba image generation model.',
        },
      ]);
    });

    it('should return warning when files exceed maximum of 3', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: [
          { type: 'url', url: 'https://example.com/image1.png' },
          { type: 'url', url: 'https://example.com/image2.png' },
          { type: 'url', url: 'https://example.com/image3.png' },
          { type: 'url', url: 'https://example.com/image4.png' },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'files',
          details:
            'The Alibaba image generation model supports a maximum of 3 files. Additional files will be ignored based on the order they are provided.',
        },
      ]);
    });

    it('should not return warning when files are within limit', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: [
          { type: 'url', url: 'https://example.com/image1.png' },
          { type: 'url', url: 'https://example.com/image2.png' },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should include files as image content in request', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'Add a hat to this cat',
        files: [
          {
            type: 'url',
            url: 'https://example.com/cat.png',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.messages[0].content).toStrictEqual([
        { text: 'Add a hat to this cat' },
        { image: 'https://example.com/cat.png' },
      ]);
    });

    it('should convert Uint8Array file data to base64', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      const imageData = new Uint8Array([1, 2, 3]);
      await model.doGenerate({
        prompt: 'Add a hat to this cat',
        files: [
          {
            type: 'file',
            data: imageData,
            mediaType: 'image/png',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.messages[0].content[1].image).toBe(
        `data:image/png;base64,${convertUint8ArrayToBase64(imageData)}`,
      );
    });

    it('should use base64 string file data directly', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'Add a hat to this cat',
        files: [
          {
            type: 'file',
            data: 'iVBORw0KGgo=',
            mediaType: 'image/png',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.messages[0].content[1].image).toBe(
        'iVBORw0KGgo=',
      );
    });

    it('should include multiple files as image content', async () => {
      prepareJsonFixtureResponse('alibaba-image');

      await model.doGenerate({
        prompt: 'Combine these images',
        files: [
          { type: 'url', url: 'https://example.com/image1.png' },
          { type: 'url', url: 'https://example.com/image2.png' },
          { type: 'url', url: 'https://example.com/image3.png' },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.input.messages[0].content).toStrictEqual([
        { text: 'Combine these images' },
        { image: 'https://example.com/image1.png' },
        { image: 'https://example.com/image2.png' },
        { image: 'https://example.com/image3.png' },
      ]);
    });

    it('should handle response without rewrite_status', async () => {
      server.urls[TEST_URL].response = {
        type: 'json-value',
        body: {
          request_id: 'test-request-id',
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [
                    {
                      image:
                        'iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAB2GNhQlgAAYHZqdW1kYzJwYQARABCAAACqADibcQNj',
                    },
                  ],
                },
              },
            ],
          },
          usage: {
            output_width: 1024,
            output_height: 1024,
            input_image_count: 1,
            input_image_type: 'base64',
            output_image_count: 1,
            output_image_type: 'base64',
          },
        },
      };

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual([
        'iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAB2GNhQlgAAYHZqdW1kYzJwYQARABCAAACqADibcQNj',
      ]);
    });

    it('should handle response without finish_reason', async () => {
      server.urls[TEST_URL].response = {
        type: 'json-value',
        body: {
          request_id: 'test-request-id',
          output: {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: [
                    {
                      image:
                        'iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAB2GNhQlgAAYHZqdW1kYzJwYQARABCAAACqADibcQNj',
                    },
                  ],
                },
              },
            ],
          },
          usage: {
            output_width: 1024,
            output_height: 1024,
            input_image_count: 1,
            input_image_type: 'base64',
            output_image_count: 1,
            output_image_type: 'base64',
          },
        },
      };

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual([
        'iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAIAAADwf7zUAAAB2GNhQlgAAYHZqdW1kYzJwYQARABCAAACqADibcQNj',
      ]);
      expect(
        // @ts-ignore
        result?.providerMetadata?.alibaba?.images[0]?.finishReason,
      ).toBeUndefined();
    });

    it('should handle multiple images in response', async () => {
      server.urls[TEST_URL].response = {
        type: 'json-value',
        body: {
          request_id: 'test-request-id',
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [
                    { image: 'base64-image-1' },
                    { image: 'base64-image-2' },
                  ],
                },
              },
            ],
          },
          usage: {
            output_width: 1024,
            output_height: 1024,
            input_image_count: 1,
            input_image_type: 'base64',
            output_image_count: 2,
            output_image_type: 'base64',
          },
        },
      };

      const result = await model.doGenerate({
        prompt: 'Generate two images',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
    });

    it('should handle multiple choices in response', async () => {
      server.urls[TEST_URL].response = {
        type: 'json-value',
        body: {
          request_id: 'test-request-id',
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [{ image: 'base64-image-1' }],
                },
              },
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [{ image: 'base64-image-2' }],
                },
              },
            ],
          },
          usage: {
            output_width: 1024,
            output_height: 1024,
            input_image_count: 1,
            input_image_type: 'base64',
            output_image_count: 2,
            output_image_type: 'base64',
          },
        },
      };

      const result = await model.doGenerate({
        prompt: 'Generate two images',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
    });
  });
});
