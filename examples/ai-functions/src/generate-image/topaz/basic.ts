import { topaz, type TopazImageModelOptions } from '@ai-sdk/topaz';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateImage({
    model: topaz.image('wonder-3.5'),
    // Topaz enhances an image you supply, so the input image is the prompt.
    prompt: {
      images: [
        'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
      ],
    },
    providerOptions: {
      topaz: {
        enhancementStrength: 'high',
        outputWidth: 2048,
        outputHeight: 2048,
      } satisfies TopazImageModelOptions,
    },
  });

  await presentImages(result.images);
});
