import { deepinfra } from '@ai-sdk/deepinfra';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: deepinfra.image('black-forest-labs/FLUX-1-schnell'),
    prompt: 'A resplendent quetzal mid flight amidst raindrops',
  });

  await presentImages(result.images);
}

main().catch(console.error);
