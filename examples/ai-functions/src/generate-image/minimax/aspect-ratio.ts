import { minimax } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const prompt = 'A majestic mountain landscape at sunrise';
  const result = await generateImage({
    model: minimax.image('image-01'),
    prompt,
    n: 1,
    aspectRatio: '16:9',
    providerOptions: {
      minimax: {
        aspect_ratio: '16:9',
      },
    },
  });

  await presentImages(result.images);

  console.log('Generated images:', result.images.length);
});
