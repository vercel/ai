import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { MiniMaxImageModel } from './minimax-image-model';

const prompt = 'A white kitten chases a butterfly across a sunlit garden.';
const TEST_BASE_URL = 'https://api.example.com';
const GENERATE_URL = `${TEST_BASE_URL}/v1/images/generations`;
const EDIT_URL = `${TEST_BASE_URL}/v1/images/edits`;
const IMAGE_B64 = 'aGVsbG8=';

function createModel() {
  return new MiniMaxImageModel('MiniMax-H3-Image', {
    provider: 'minimax.image',
    baseURL: TEST_BASE_URL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
  });
}

function generateOptions(overrides: Record<string, unknown> = {}) {
  return {
    prompt,
    n: 1,
    size: undefined,
    aspectRatio: undefined,
    seed: undefined,
    providerOptions: {},
    files: undefined,
    mask: undefined,
    ...overrides,
  };
}

describe('MiniMaxImageModel', () => {
  const server = createTestServer({
    [GENERATE_URL]: {
      response: {
        type: 'json-value',
        body: { data: [{ b64_json: IMAGE_B64 }] },
      },
    },
    [EDIT_URL]: {
      response: {
        type: 'json-value',
        body: { data: [{ b64_json: IMAGE_B64 }] },
      },
    },
  });

  it('should send aspect_ratio and area for text-to-image', async () => {
    const result = await createModel().doGenerate(
      generateOptions({
        aspectRatio: '1:1',
        providerOptions: { minimax: { area: '1K' } },
      }),
    );

    expect(server.calls[0].requestUrl).toBe(GENERATE_URL);
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt,
      n: 1,
      response_format: 'b64_json',
      aspect_ratio: '1:1',
      area: '1K',
    });
    expect(result.images).toEqual([IMAGE_B64]);
    expect(result.warnings).toEqual([]);
  });

  it('should send pixel size instead of aspect_ratio and area', async () => {
    const result = await createModel().doGenerate(
      generateOptions({
        size: '1024x1024',
        aspectRatio: '1:1',
        providerOptions: { minimax: { area: '1K' } },
      }),
    );

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt,
      n: 1,
      response_format: 'b64_json',
      size: '1024x1024',
    });
    expect(result.warnings).toHaveLength(2);
  });

  it('should send reference images as image_url values for edits', async () => {
    const png = new Uint8Array([9, 8, 7]);

    await createModel().doGenerate(
      generateOptions({
        files: [
          {
            type: 'url',
            url: 'https://cdn.example.com/ref.png',
            mediaType: 'image/png',
          },
          { type: 'file', data: png, mediaType: 'image/png' },
        ],
        providerOptions: { minimax: { area: '1K', aspectRatio: '1:1' } },
      }),
    );

    expect(server.calls[0].requestUrl).toBe(EDIT_URL);
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt,
      n: 1,
      response_format: 'b64_json',
      aspect_ratio: '1:1',
      area: '1K',
      images: [
        { image_url: 'https://cdn.example.com/ref.png' },
        {
          image_url: `data:image/png;base64,${convertUint8ArrayToBase64(png)}`,
        },
      ],
    });
  });
});
