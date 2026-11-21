import { readFile } from 'node:fs/promises';
import { minimax } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: minimax.image('MiniMax-H3-Image-Highspeed'),
    prompt: {
      text: 'Turn the cat into a dog, keeping the original style and background.',
      images: [await readFile('data/comic-cat.png')],
    },
    size: '1024x1024',
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(600_000),
  });
  await presentImages([image]);
});
