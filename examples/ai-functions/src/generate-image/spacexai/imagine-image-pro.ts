import { spacexai } from '@ai-sdk/spacexai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: spacexai.image('grok-imagine-image-pro'),
    prompt: 'A salamander at dusk in a forest pond surrounded by fireflies.',
  });

  await presentImages([image]);
});
