import { xai } from '@ai-sdk/xai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: xai.imageModel('grok-2-image'),
    n: 3,
    prompt: 'A salamander at dusk in a forest pond surrounded by fireflies.',
  });

  await presentImages(images);
}

main().catch(console.error);
