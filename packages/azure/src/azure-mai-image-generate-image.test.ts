import type { FetchFunction } from '@ai-sdk/provider-utils';
import { generateImage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { createAzure } from './azure-openai-provider';

vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

function setup() {
  const fetch = vi.fn<FetchFunction>(
    async () =>
      new Response(
        JSON.stringify({
          size: '1024x1024',
          usage: {
            num_output_tokens: 1024,
            num_input_text_tokens: 5,
            num_input_image_tokens: 0,
          },
          data: [{ b64_json: 'iVBORw0KGgo=' }],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  const azure = createAzure({
    resourceName: 'test-resource',
    apiKey: 'test-key',
    fetch,
  });
  return { azure, fetch };
}

describe('Azure MAI-Image generateImage integration', () => {
  it('returns n images for MAI-Image deployments', async () => {
    const { azure, fetch } = setup();

    const result = await generateImage({
      model: azure.image('MAI-Image-2.6'),
      prompt: 'A red apple',
      n: 2,
    });

    expect(result.images).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // OpenAI-looking deployment names advertise a larger per-call limit, so
  // core sends n > 1 in one call; the MAI model must still return n images.
  it('returns n images when api: mai overrides an OpenAI-looking deployment', async () => {
    const { azure, fetch } = setup();

    const result = await generateImage({
      model: azure.image('gpt-image-production'),
      prompt: 'A red apple',
      n: 2,
      providerOptions: { azure: { api: 'mai' } },
    });

    expect(result.images).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url] of fetch.mock.calls) {
      expect(String(url)).toBe(
        'https://test-resource.services.ai.azure.com/mai/v1/images/generations',
      );
    }
    expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 2048 });
  });
});
