import { fal } from '@ai-sdk/fal';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: fal.image('fal-ai/flux/schnell'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
  });
  await presentImages(images);
}

main().catch(console.error);
