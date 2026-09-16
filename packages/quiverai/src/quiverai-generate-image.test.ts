import { InvalidArgumentError } from '@ai-sdk/provider';
import { generateImage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { createQuiverAI } from './quiverai-provider';

const encoder = new TextEncoder();

describe('QuiverAI generateImage integration', () => {
  it('rejects structurally malformed SVG input before networking', async () => {
    const fetch = vi.fn();
    const provider = createQuiverAI({
      apiKey: 'test-api-key',
      fetch,
    });

    await expect(
      generateImage({
        model: provider.image('arrow-2'),
        prompt: {
          text: 'Make the icon blue.',
          images: [encoder.encode('<svg><g></svg>')],
        },
        providerOptions: {
          quiverai: {
            operation: 'edit',
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects global edit batching even when calls are split one at a time', async () => {
    const fetch = vi.fn();
    const provider = createQuiverAI({
      apiKey: 'test-api-key',
      fetch,
    });

    await expect(
      generateImage({
        model: provider.image('arrow-2'),
        prompt: {
          text: 'Make the icon blue.',
          images: [encoder.encode('<svg><rect width="10" height="10"/></svg>')],
        },
        n: 2,
        maxImagesPerCall: 1,
        providerOptions: {
          quiverai: {
            operation: 'edit',
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    expect(fetch).not.toHaveBeenCalled();
  });
});
