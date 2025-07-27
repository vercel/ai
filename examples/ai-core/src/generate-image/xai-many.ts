import { xai } from '@ai-sdk/xai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: xai.image('grok-2-image'),
    n: 3,
    prompt: 'A chicken flying into the sunset in the style of anime.',
  });

  await presentImages(images);
}

main().catch(console.error);
