import { blackForestLabs as bfl } from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: bfl.image('flux-pro-1.1'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
    aspectRatio: '1:1',
  });
  await presentImages(images);
}

main().catch(console.error);
