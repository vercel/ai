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
    size: '2048x2048',
    providerOptions: {
      topaz: {
        enhancementStrength: 'high',
      } satisfies TopazImageModelOptions,
    },
  });

  // `topaz.credits` is what Topaz charged for the job.
  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
  await presentImages(result.images);
});
