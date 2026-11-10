import { minimax } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: minimax.image('MiniMax-H3-Image'),
    prompt: 'A salamander at dusk in a forest pond surrounded by fireflies.',
    size: '1024x1024',
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(600_000),
  });
  await presentImages([image]);
});
