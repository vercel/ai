import {
  blackForestLabs,
  type BlackForestLabsImageModelOptions,
} from '@ai-sdk/black-forest-labs';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: blackForestLabs.image('flux-3-image'),
    prompt: 'A watercolor illustration of a coastal village at dawn',
    aspectRatio: '16:9',
    providerOptions: {
      blackForestLabs: {
        resolution: '2k',
        grounding: false,
        pollTimeoutMillis: 240000,
      } satisfies BlackForestLabsImageModelOptions,
    },
  });

  await presentImages(images);
});
