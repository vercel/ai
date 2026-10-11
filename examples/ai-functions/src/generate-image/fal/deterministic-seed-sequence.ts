import { fal } from '@ai-sdk/fal';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: fal.image('fal-ai/flux/dev'),
    prompt: 'A glass greenhouse floating above a misty forest at dawn',
    n: 3,
    seed: 42,
    seedStrategy: 'increment', // split calls use seeds 42, 43, and 44
  });

  await presentImages(images);
});
