import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: 'bfl/flux-kontext-pro',
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
  });
  await presentImages(images);
}

main().catch(console.error);
