import { PhotaImageModelOptions, phota } from '@ai-sdk/phota';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: phota.image('edit'),
    prompt: {
      text: 'Add a sunset sky in the background',
      images: ['https://picsum.photos/id/16/512/512'],
    },
    providerOptions: {
      phota: {
        proMode: true,
      } satisfies PhotaImageModelOptions,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
});
