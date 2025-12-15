import { readFileSync } from 'node:fs';
import { replicate, ReplicateImageProviderOptions } from '@ai-sdk/replicate';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';
import 'dotenv/config';

run(async () => {
  const imageBuffer = readFileSync('data/comic-cat.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Picture of a dog in the same style as the input image';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: replicate.image('black-forest-labs/flux-fill-pro'),
    prompt: {
      text: prompt,
      images: [imageBuffer],
    },
    providerOptions: {
      replicate: {
        guidance_scale: 7.5,
        num_inference_steps: 30,
      } satisfies ReplicateImageProviderOptions,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
});
