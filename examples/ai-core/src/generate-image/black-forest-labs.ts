import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: blackForestLabs.image('flux-pro-1.1'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
    aspectRatio: '1:1',
  });
  await presentImages(images);
});