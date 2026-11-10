import { minimax, type MiniMaxImageModelOptions } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: minimax.image('MiniMax-H3-Image'),
    prompt: 'A white kitten chasing a butterfly in a sunlit garden.',
    aspectRatio: '1:1',
    maxRetries: 0,
    providerOptions: {
      minimax: {
        area: '1K',
      } satisfies MiniMaxImageModelOptions,
    },
  });

  await presentImages(images);
});
