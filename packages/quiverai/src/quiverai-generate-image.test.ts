import { InvalidArgumentError } from '@ai-sdk/provider';
import { generateImage, wrapImageModel } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { editSvgResponseFixture } from './__fixtures__/quiverai-fixtures';
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

  it('rejects multiple outputs in a single edit request before networking', async () => {
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
        providerOptions: {
          quiverai: {
            operation: 'edit',
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'generates multiple edits through separate requests (middleware: %s)',
    async useMiddleware => {
      const fetch = vi.fn(
        async () =>
          new Response(JSON.stringify(editSvgResponseFixture), {
            headers: { 'Content-Type': 'application/json' },
          }),
      );
      const provider = createQuiverAI({ apiKey: 'test-api-key', fetch });
      const model = provider.image('arrow-2');
      const providerOptions = { quiverai: { operation: 'edit' } };
      const sourceSvg = '<svg><rect width="10" height="10"/></svg>';

      const result = await generateImage({
        model: useMiddleware
          ? wrapImageModel({
              model,
              middleware: {
                specificationVersion: 'v4',
                transformParams: async ({ params }) => ({
                  ...params,
                  providerOptions,
                }),
              },
            })
          : model,
        prompt: {
          text: 'Make the icon blue.',
          images: [encoder.encode(sourceSvg)],
        },
        n: 2,
        maxImagesPerCall: 1,
        providerOptions: useMiddleware ? undefined : providerOptions,
      });

      expect(result.images).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const image of result.images) {
        expect(new TextDecoder().decode(image.uint8Array)).toBe(
          editSvgResponseFixture.data[0].svg,
        );
      }
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.quiver.ai/v1/svgs/edits',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'arrow-2',
            prompt: 'Make the icon blue.',
            svg_source: { base64: btoa(sourceSvg) },
            stream: false,
          }),
        }),
      );
      expect(fetch.mock.calls[1]).toEqual(fetch.mock.calls[0]);
    },
  );
});
