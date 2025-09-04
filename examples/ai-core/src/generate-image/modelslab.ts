import { modelslab } from '@ai-sdk/modelslab';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
  });
  await presentImages(images);
}

main().catch(console.error);
