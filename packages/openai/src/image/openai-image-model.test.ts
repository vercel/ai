import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createOpenAI } from '../openai-provider';
import { OpenAIImageModel } from './openai-image-model';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt = 'A cute baby sea otter';

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.image('dall-e-3');

const server = createTestServer({
  'https://api.openai.com/v1/images/generations': {},
  'https://api.openai.com/v1/images/edits': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.openai.com/v1/images/generations'].response = {
      type: 'json-value',
      headers,
      body: {
        created: 1733837122,
        data: [
          {
            revised_prompt:
              'A charming visual illustration of a baby sea otter swimming joyously.',
            b64_json: 'base64-image-1',
          },
          {
            b64_json: 'base64-image-2',
          },
        ],
      },
    };
  }

  it('should pass the model and the settings', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { openai: { style: 'vivid' } },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      style: 'vivid',
      response_format: 'b64_json',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.image('dall-e-3').doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { openai: { style: 'vivid' } },
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/openai/0.0.0-test`,
    );
  });

  it('should extract the generated images', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
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

  it('should return warnings for unsupported settings', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 123,
      providerOptions: {},
    });

    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "details": "This model does not support aspect ratio. Use \`size\` instead.",
          "feature": "aspectRatio",
          "type": "unsupported",
        },
        {
          "feature": "seed",
          "type": "unsupported",
        },
      ]
    `);
  });

  it('should respect maxImagesPerCall setting', async () => {
    const defaultModel = provider.image('dall-e-2');
    expect(defaultModel.maxImagesPerCall).toBe(10); // dall-e-2's default from settings

    const unknownModel = provider.image('unknown-model' as any);
    expect(unknownModel.maxImagesPerCall).toBe(1); // fallback for unknown models
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date('2024-03-15T12:00:00Z');

    const customModel = new OpenAIImageModel('dall-e-3', {
      provider: 'test-provider',
      url: () => 'https://api.openai.com/v1/images/generations',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'dall-e-3',
      headers: {
        'content-length': '180',
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareJsonResponse();
    const beforeDate = new Date();

    const result = await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
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
    expect(result.response.modelId).toBe('dall-e-3');
  });

  it('should not include response_format for gpt-image-1', async () => {
    prepareJsonResponse();

    const gptImageModel = provider.image('gpt-image-1');
    await gptImageModel.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    const requestBody =
      await server.calls[server.calls.length - 1].requestBodyJson;
    expect(requestBody).toStrictEqual({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    });

    expect(requestBody).not.toHaveProperty('response_format');
  });

  it('should handle null revised_prompt responses', async () => {
    server.urls['https://api.openai.com/v1/images/generations'].response = {
      type: 'json-value',
      body: {
        created: 1733837122,
        data: [
          {
            revised_prompt: null,
            b64_json: 'base64-image-1',
          },
        ],
      },
    };

    const result = await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(['base64-image-1']);
    expect(result.warnings).toStrictEqual([]);
    expect(result.providerMetadata).toStrictEqual({
      openai: {
        images: [
          {
            created: 1733837122,
            size: undefined,
            quality: undefined,
            background: undefined,
            outputFormat: undefined,
          },
        ],
      },
    });
  });

  it('should include response_format for dall-e-3', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    const requestBody =
      await server.calls[server.calls.length - 1].requestBodyJson;
    expect(requestBody).toHaveProperty('response_format', 'b64_json');
  });

  it('should return image meta data', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { openai: { style: 'vivid' } },
    });

    expect(result.providerMetadata).toStrictEqual({
      openai: {
        images: [
          {
            revisedPrompt:
              'A charming visual illustration of a baby sea otter swimming joyously.',
            created: 1733837122,
            size: undefined,
            quality: undefined,
            background: undefined,
            outputFormat: undefined,
          },
          {
            created: 1733837122,
            size: undefined,
            quality: undefined,
            background: undefined,
            outputFormat: undefined,
          },
        ],
      },
    });
  });

  it('should map OpenAI usage to usage', async () => {
    server.urls['https://api.openai.com/v1/images/generations'].response = {
      type: 'json-value',
      body: {
        created: 1733837122,
        data: [
          {
            b64_json: 'base64-image-1',
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 0,
          total_tokens: 12,
          input_tokens_details: {
            image_tokens: 7,
            text_tokens: 5,
          },
        },
      },
    };

    const result = await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: undefined,
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.usage).toStrictEqual({
      inputTokens: 12,
      outputTokens: 0,
      totalTokens: 12,
    });
  });
});

describe('doGenerate - image editing', () => {
  function prepareEditResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.openai.com/v1/images/edits'].response = {
      type: 'json-value',
      headers,
      body: {
        created: 1733837122,
        data: [
          {
            b64_json: 'edited-base64-image-1',
          },
        ],
      },
    };
  }

  it('should call /images/edits endpoint when files are provided', async () => {
    prepareEditResponse();

    await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]), // PNG magic bytes
        },
      ],
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://api.openai.com/v1/images/edits',
    );
  });

  it('should send image as form data with Uint8Array input', async () => {
    prepareEditResponse();

    await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model: 'gpt-image-1',
      prompt,
      n: '1',
      size: '1024x1024',
    });
  });

  it('should send image as form data with base64 string input', async () => {
    prepareEditResponse();

    await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: 'iVBORw0KGgo=', // base64 encoded PNG header
        },
      ],
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.model).toBe('gpt-image-1');
    expect(multipart?.image).toBeDefined();
  });

  it('should send multiple images as form data array', async () => {
    prepareEditResponse();

    await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: new Uint8Array([255, 216, 255, 224]),
        },
      ],
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.['image[]']).toBeDefined();
  });

  it('should pass provider options in form data', async () => {
    prepareEditResponse();

    await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {
        openai: {
          quality: 'high',
          background: 'transparent',
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      quality: 'high',
      background: 'transparent',
    });
  });

  it('should extract the edited images from response', async () => {
    prepareEditResponse();

    const result = await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(['edited-base64-image-1']);
  });

  it('should include response metadata for edited images', async () => {
    prepareEditResponse({
      headers: {
        'x-request-id': 'edit-request-id',
      },
    });

    const testDate = new Date('2024-03-15T12:00:00Z');

    const customModel = new OpenAIImageModel('gpt-image-1', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.openai.com/v1${path}`,
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response.timestamp).toEqual(testDate);
    expect(result.response.modelId).toBe('gpt-image-1');
    expect(result.response.headers?.['x-request-id']).toBe('edit-request-id');
  });

  it('should return warnings for unsupported settings in edit mode', async () => {
    prepareEditResponse();

    const result = await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      mask: undefined,
      n: 1,
      size: '1024x1024',
      aspectRatio: '16:9',
      seed: 42,
      providerOptions: {},
    });

    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "details": "This model does not support aspect ratio. Use \`size\` instead.",
          "feature": "aspectRatio",
          "type": "unsupported",
        },
        {
          "feature": "seed",
          "type": "unsupported",
        },
      ]
    `);
  });

  it('should return usage information for edited images', async () => {
    server.urls['https://api.openai.com/v1/images/edits'].response = {
      type: 'json-value',
      body: {
        created: 1733837122,
        data: [
          {
            b64_json: 'edited-base64-image-1',
          },
        ],
        usage: {
          input_tokens: 25,
          output_tokens: 0,
          total_tokens: 25,
        },
      },
    };

    const result = await provider.image('gpt-image-1').doGenerate({
      prompt,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([137, 80, 78, 71]),
        },
      ],
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.usage).toStrictEqual({
      inputTokens: 25,
      outputTokens: 0,
      totalTokens: 25,
    });
  });
});
