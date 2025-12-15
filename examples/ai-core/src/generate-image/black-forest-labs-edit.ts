import {
  BlackForestLabsImageProviderOptions,
  blackForestLabs,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';
import 'dotenv/config';

run(async () => {
  const prompt =
    'Add a saddle and reins to the cat in the image';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: blackForestLabs.image('flux-kontext-pro'),
    prompt: {
      text: prompt,
      images: [
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/1200px-Cat_November_2010-1a.jpg',
      ],
    },
    providerOptions: {
      blackForestLabs: {
        width: 1024,
        height: 768,
      } satisfies BlackForestLabsImageProviderOptions,
    },
  })

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
});
