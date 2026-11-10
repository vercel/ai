import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { MiniMaxImageModel } from './minimax-image-model';

const prompt = 'A white kitten chases a butterfly.';
const TEST_BASE_URL = 'https://api.example.com';
const IMAGE_B64 = 'aGVsbG8=';

function createModel() {
  return new MiniMaxImageModel('MiniMax-H3-Image', {
    provider: 'minimax.image',
    baseURL: TEST_BASE_URL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
  });
}

describe('MiniMaxImageModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/v1/images/generations`]: {
      response: {
        type: 'json-value',
        body: { data: [{ b64_json: IMAGE_B64 }] },
      },
    },
    [`${TEST_BASE_URL}/v1/images/edits`]: {
      response: {
        type: 'json-value',
        body: { data: [{ b64_json: IMAGE_B64 }] },
      },
    },
  });

  it('should generate an image with aspect_ratio and area', async () => {
    const result = await createModel().doGenerate({
      prompt,
      n: 1,
      size: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      aspectRatio: '1:1',
      providerOptions: { minimax: { area: '1K' } },
    });

    expect(server.calls[0].requestUrl).toBe(
      `${TEST_BASE_URL}/v1/images/generations`,
    );
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt,
      n: 1,
      response_format: 'b64_json',
      aspect_ratio: '1:1',
      area: '1K',
    });
    expect(result.images).toEqual([IMAGE_B64]);
  });

  it('should edit an image with image_url references', async () => {
    await createModel().doGenerate({
      prompt,
      n: 1,
      size: undefined,
      seed: undefined,
      mask: undefined,
      aspectRatio: undefined,
      providerOptions: { minimax: { area: '1K' } },
      files: [
        {
          type: 'url',
          url: 'https://cdn.example.com/ref.png',
        },
      ],
    });

    expect(server.calls[0].requestUrl).toBe(`${TEST_BASE_URL}/v1/images/edits`);
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'MiniMax-H3-Image',
      prompt,
      n: 1,
      response_format: 'b64_json',
      area: '1K',
      images: [{ image_url: 'https://cdn.example.com/ref.png' }],
    });
  });
});
