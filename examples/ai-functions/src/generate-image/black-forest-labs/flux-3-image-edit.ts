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
    prompt: {
      text: 'Change the color of only one bird in the middle to bright red',
      images: [
        'https://cdn.sanity.io/images/2gpum2i6/production/4792198dfeba9223bf3ecf020fed2942de7f0bd7-1800x1200.webp',
      ],
    },
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
