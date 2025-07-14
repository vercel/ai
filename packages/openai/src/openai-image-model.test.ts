import { createTestServer } from '@ai-sdk/provider-utils/test';
import { ImageInput } from '@ai-sdk/provider';
import { OpenAIImageModel } from './openai-image-model';
import { createOpenAI } from './openai-provider';

const prompt = 'A cute baby sea otter';

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.imageModel('dall-e-3');

const server = createTestServer({
  'https://api.openai.com/v1/images/generations': {},
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

    await provider.imageModel('dall-e-3').doGenerate({
      prompt,
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
  });

  it('should extract the generated images', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
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
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 123,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      },
      {
        type: 'unsupported-setting',
        setting: 'seed',
      },
    ]);
  });

  it('should respect maxImagesPerCall setting', async () => {
    const defaultModel = provider.imageModel('dall-e-2');
    expect(defaultModel.maxImagesPerCall).toBe(10); // dall-e-2's default from settings

    const unknownModel = provider.imageModel('unknown-model' as any);
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

    const gptImageModel = provider.imageModel('gpt-image-1');
    await gptImageModel.doGenerate({
      prompt,
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

  it('should include response_format for dall-e-3', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
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
          },
          null,
        ],
      },
    });
  });
});

describe('doGenerate - Image Editing', () => {
  const editServer = createTestServer({
    'https://api.openai.com/v1/images/edits': {},
  });

  function prepareEditResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    editServer.urls['https://api.openai.com/v1/images/edits'].response = {
      type: 'json-value',
      headers,
      body: {
        created: 1733837122,
        data: [
          {
            b64_json: 'edited-base64-image-1',
          },
          {
            b64_json: 'edited-base64-image-2',
          },
        ],
      },
    };
  }

  it('should edit image with Uint8Array', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]); // PNG header
    const dalleModel = provider.imageModel('dall-e-2');

    const result = await dalleModel.doGenerate({
      prompt: 'Add a rainbow',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      images: [{ image: imageData }],
    });

    expect(result.images).toStrictEqual([
      'edited-base64-image-1',
      'edited-base64-image-2',
    ]);

    // Verify it's a FormData request
    const call = editServer.calls[0];
    expect(call.requestHeaders['content-type']).toMatch(/multipart\/form-data/);
  });

  it('should edit image with base64 string', async () => {
    prepareEditResponse();

    const base64Image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const dalleModel = provider.imageModel('dall-e-2');

    await dalleModel.doGenerate({
      prompt: 'Add stars',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      images: [{ image: base64Image }],
    });

    const call = editServer.calls[editServer.calls.length - 1];
    expect(call.requestHeaders['content-type']).toMatch(/multipart\/form-data/);
  });

  it('should edit image with mask', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]);
    const maskData = new Uint8Array([137, 80, 78, 71]);
    const dalleModel = provider.imageModel('dall-e-2');

    await dalleModel.doGenerate({
      prompt: 'Add a sunset',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      images: [{ image: imageData }],
      mask: maskData,
    });

    const call = editServer.calls[editServer.calls.length - 1];
    expect(call.requestHeaders['content-type']).toMatch(/multipart\/form-data/);
  });

  it('should edit image with base64 mask', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]);
    const base64Mask =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const dalleModel = provider.imageModel('dall-e-2');

    await dalleModel.doGenerate({
      prompt: 'Replace the background',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      images: [{ image: imageData }],
      mask: base64Mask,
    });

    const call = editServer.calls[editServer.calls.length - 1];
    expect(call.requestHeaders['content-type']).toMatch(/multipart\/form-data/);
  });

  it('should edit multiple images with gpt-image-1', async () => {
    prepareEditResponse();

    const imageData1 = new Uint8Array([137, 80, 78, 71]);
    const imageData2 = new Uint8Array([137, 80, 78, 71]);
    const gptImageModel = provider.imageModel('gpt-image-1');

    await gptImageModel.doGenerate({
      prompt: 'Combine these images',
      n: 2,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { openai: { quality: 'high' } },
      images: [{ image: imageData1 }, { image: imageData2 }],
    });

    const call = editServer.calls[editServer.calls.length - 1];
    expect(call.requestHeaders['content-type']).toMatch(/multipart\/form-data/);
  });

  it('should throw error for unsupported model', async () => {
    const imageData = new Uint8Array([137, 80, 78, 71]);
    const dalleModel = provider.imageModel('dall-e-3');

    await expect(
      dalleModel.doGenerate({
        prompt: 'Edit this image',
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        images: [{ image: imageData }],
      }),
    ).rejects.toThrow(
      'Model dall-e-3 does not support image editing. Only dall-e-2 and gpt-image-1 are supported.',
    );
  });

  it('should throw error for dall-e-2 with multiple images', async () => {
    const imageData1 = new Uint8Array([137, 80, 78, 71]);
    const imageData2 = new Uint8Array([137, 80, 78, 71]);
    const dalleModel = provider.imageModel('dall-e-2');

    await expect(
      dalleModel.doGenerate({
        prompt: 'Edit these images',
        n: 1,
        size: '512x512',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        images: [{ image: imageData1 }, { image: imageData2 }],
      }),
    ).rejects.toThrow('dall-e-2 only supports editing a single image.');
  });

  it('should return warnings for unsupported settings in edit mode', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]);
    const gptImageModel = provider.imageModel('gpt-image-1');

    const result = await gptImageModel.doGenerate({
      prompt: 'Edit this image',
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 123,
      providerOptions: {},
      images: [{ image: imageData }],
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      },
    ]);
  });

  it('should warn about seed for dall-e-2 in edit mode', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]);
    const dalleModel = provider.imageModel('dall-e-2');

    const result = await dalleModel.doGenerate({
      prompt: 'Edit this image',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: 123,
      providerOptions: {},
      images: [{ image: imageData }],
    });

    expect(result.warnings).toContainEqual({
      type: 'unsupported-setting',
      setting: 'seed',
    });
  });

  it('should include response data with correct endpoint', async () => {
    prepareEditResponse({
      headers: {
        'x-request-id': 'edit-request-id',
      },
    });

    const testDate = new Date('2024-03-15T12:00:00Z');
    const imageData = new Uint8Array([137, 80, 78, 71]);

    const customModel = new OpenAIImageModel('dall-e-2', {
      provider: 'test-provider',
      url: ({ path }: { path: string }) => `https://api.openai.com/v1${path}`,
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      prompt: 'Edit this image',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      images: [{ image: imageData }],
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'dall-e-2',
      headers: {
        'content-length': '105',
        'content-type': 'application/json',
        'x-request-id': 'edit-request-id',
      },
    });
  });

  it('should pass headers for edit requests', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]);
    const providerWithHeaders = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await providerWithHeaders.imageModel('dall-e-2').doGenerate({
      prompt: 'Edit this image',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      images: [{ image: imageData }],
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const call = editServer.calls[editServer.calls.length - 1];
    expect(call.requestHeaders['authorization']).toBe('Bearer test-api-key');
    expect(call.requestHeaders['openai-organization']).toBe(
      'test-organization',
    );
    expect(call.requestHeaders['custom-provider-header']).toBe(
      'provider-header-value',
    );
    expect(call.requestHeaders['custom-request-header']).toBe(
      'request-header-value',
    );
  });

  it('should handle provider options in edit requests', async () => {
    prepareEditResponse();

    const imageData = new Uint8Array([137, 80, 78, 71]);
    const gptImageModel = provider.imageModel('gpt-image-1');

    await gptImageModel.doGenerate({
      prompt: 'Edit this image',
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
      images: [{ image: imageData }],
    });

    // FormData content is harder to inspect directly, but we can verify the request was made
    const call = editServer.calls[editServer.calls.length - 1];
    expect(call.requestHeaders['content-type']).toMatch(/multipart\/form-data/);
  });
});
