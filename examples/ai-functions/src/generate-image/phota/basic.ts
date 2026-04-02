import { PhotaImageModelOptions, phota } from '@ai-sdk/phota';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images, providerMetadata } = await generateImage({
    model: phota.image('generate'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
    aspectRatio: '1:1',
    providerOptions: {
      phota: {
        proMode: true,
        resolution: '4K',
      } satisfies PhotaImageModelOptions,
    },
  });

  await presentImages(images);

  console.log('providerMetadata', JSON.stringify(providerMetadata, null, 2));
});
