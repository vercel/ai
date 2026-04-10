import { phota } from '@ai-sdk/phota';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images, providerMetadata } = await generateImage({
    model: phota.image('enhance'),
    prompt: {
      images: ['https://avatars.githubusercontent.com/in/1765080'],
    },
  });

  console.log('ENHANCED IMAGE:');
  await presentImages(images);

  console.log('providerMetadata', JSON.stringify(providerMetadata, null, 2));
});
