import { PhotaImageModelOptions, phota } from '@ai-sdk/phota';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: phota.image('edit'),
    prompt: {
      text: 'Make the sun shine through the trees',
      images: ['https://avatars.githubusercontent.com/in/1765080'],
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
