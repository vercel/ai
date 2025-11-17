import {
  BlackForestLabsImageProviderOptions,
  blackForestLabs,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const response = await generateImage({
    model: blackForestLabs.image('flux-pro-1.1'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
    aspectRatio: '1:1',
    n: 2,
    providerOptions: {
      blackForestLabs: {
        outputFormat: 'png',
      } satisfies BlackForestLabsImageProviderOptions,
    },
  });
  await presentImages(response.images);

  console.log('response.providerMetadata', JSON.stringify(response.providerMetadata, null, 2));
});
