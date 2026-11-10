import type { ImageModelV4CallOptions } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createMiniMax } from './minimax-provider';

const baseURL = 'https://api.example.com/v1';
const generationURL = `${baseURL}/images/generations`;
const editURL = `${baseURL}/images/edits`;
const imageURL = 'https://api.example.com/generated.png';
const image = {
  url: imageURL,
  size: '1024x1024',
  revised_prompt: 'A red circle.',
};
const usage = {
  generated_images: 1,
  input_tokens: 30,
  output_tokens: 40,
  total_tokens: 70,
  input_tokens_details: { text_tokens: 10, image_tokens: 20 },
  output_tokens_details: { image_tokens: 40 },
};
const params: ImageModelV4CallOptions = {
  prompt: 'A red circle.',
  n: 1,
  size: undefined,
  aspectRatio: undefined,
  seed: undefined,
  files: undefined,
  mask: undefined,
  providerOptions: {},
};
const provider = () =>
  createMiniMax({
    apiKey: 'test-key',
    imageBaseURL: baseURL,
    headers: { 'custom-header': 'value' },
  });

describe('MiniMaxImageModel', () => {
  const server = createTestServer({
    [generationURL]: {
      response: {
        type: 'json-value',
        body: {
          data: [image],
          usage,
          output_format: 'png',
          request_id: 'request-1',
        },
      },
    },
    [editURL]: {
      response: { type: 'json-value', body: { data: [image], usage } },
    },
    [imageURL]: {
      response: {
        type: 'binary',
        body: Buffer.from([1, 2, 3]),
        headers: { 'content-type': 'image/png' },
      },
    },
  });

  it('generates and downloads images while preserving usage', async () => {
    const result = await provider()
      .image('MiniMax-H3-Image')
      .doGenerate({
        ...params,
        size: '1024x1024',
        seed: 1,
        headers: { 'request-header': 'request' },
        providerOptions: {
          minimax: {
            disablePromptEnhanced: true,
            outputFormat: 'png',
            outputCompression: 90,
          },
        },
      });
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt: params.prompt,
      n: 1,
      size: '1024x1024',
      disable_prompt_enhanced: true,
      output_format: 'png',
      output_compression: 90,
      response_format: 'url',
    });
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-key',
      'custom-header': 'value',
      'request-header': 'request',
    });
    expect(server.calls[1].requestHeaders).not.toHaveProperty('authorization');
    expect(server.calls[1].requestHeaders).not.toHaveProperty('custom-header');
    expect(result.images).toEqual([new Uint8Array([1, 2, 3])]);
    expect(result.usage).toEqual({
      inputTokens: 30,
      outputTokens: 40,
      totalTokens: 70,
    });
    expect(result.providerMetadata?.minimax).toEqual({
      images: [
        {
          size: '1024x1024',
          revisedPrompt: image.revised_prompt,
          usage,
          outputFormat: 'png',
          requestId: 'request-1',
        },
      ],
    });
    expect(result.warnings).toEqual([{ type: 'unsupported', feature: 'seed' }]);
  });

  it('maps aspect ratio, area, and batch size without supplying a pixel size', async () => {
    const batchUsage = { ...usage, generated_images: 2 };
    server.urls[generationURL].response = {
      type: 'json-value',
      body: { data: [image, image], usage: batchUsage },
    };
    const result = await provider()
      .image('MiniMax-H3-Image')
      .doGenerate({
        ...params,
        n: 2,
        aspectRatio: '16:9',
        providerOptions: { minimax: { area: '2K' } },
      });
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt: params.prompt,
      n: 2,
      aspect_ratio: '16:9',
      area: '2K',
      response_format: 'url',
    });
    expect(result.providerMetadata?.minimax.images).toEqual([
      {
        size: '1024x1024',
        revisedPrompt: image.revised_prompt,
        usage: batchUsage,
      },
      { size: '1024x1024', revisedPrompt: image.revised_prompt },
    ]);
  });

  it('edits binary and URL references and omits the generation-only prompt option', async () => {
    const result = await provider()
      .image('MiniMax-H3-Image')
      .doGenerate({
        ...params,
        files: [
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3]),
            mediaType: 'image/png',
          },
          { type: 'url', url: 'https://example.com/reference.png' },
        ],
        providerOptions: { minimax: { disablePromptEnhanced: true } },
      });
    expect(server.calls[0].requestUrl).toBe(editURL);
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt: params.prompt,
      n: 1,
      images: [
        { image_url: 'data:image/png;base64,AQID' },
        { image_url: 'https://example.com/reference.png' },
      ],
      response_format: 'url',
    });
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'disablePromptEnhanced',
        details: 'MiniMax image edits always apply prompt enhancement.',
      },
    ]);
  });

  it('returns successful images and reports per-image failures without losing request usage', async () => {
    server.urls[generationURL].response = {
      type: 'json-value',
      body: {
        data: [
          image,
          { error: { code: '1027', message: 'Content safety check failed.' } },
        ],
        usage,
      },
    };
    const result = await provider()
      .image('MiniMax-H3-Image')
      .doGenerate({ ...params, n: 2 });
    expect(result.images).toHaveLength(1);
    expect(result.providerMetadata?.minimax.images).toHaveLength(1);
    expect(result.providerMetadata?.minimax).toMatchObject({
      images: [{ usage }],
    });
    expect(result.warnings).toEqual([
      {
        type: 'other',
        message: 'Image 2 failed: Content safety check failed.',
      },
    ]);
  });

  it('rejects masks before sending an unmasked edit', async () => {
    await expect(
      provider()
        .image('MiniMax-H3-Image')
        .doGenerate({
          ...params,
          mask: {
            type: 'file',
            data: new Uint8Array([1]),
            mediaType: 'image/png',
          },
        }),
    ).rejects.toThrow('MiniMax image masks');
    expect(server.calls).toHaveLength(0);
  });

  it.each(['submission', 'download'])(
    'marks a failed %s as non-retryable',
    async phase => {
      const url = phase === 'submission' ? generationURL : imageURL;
      server.urls[url].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({ error: { message: 'Temporary server error' } }),
      };
      await expect(
        provider().image('MiniMax-H3-Image').doGenerate(params),
      ).rejects.toMatchObject({ isRetryable: false, statusCode: 500 });
      expect(
        server.calls.filter(call => call.requestUrl === generationURL),
      ).toHaveLength(1);
    },
  );

  it('preserves the provider error message', async () => {
    server.urls[generationURL].response = {
      type: 'error',
      status: 402,
      body: JSON.stringify({
        error: { message: 'Insufficient balance (1008)' },
      }),
    };
    await expect(
      provider().image('MiniMax-H3-Image').doGenerate(params),
    ).rejects.toThrow('Insufficient balance (1008)');
  });
});
