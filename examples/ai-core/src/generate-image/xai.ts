import { xai } from '@ai-sdk/xai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: xai.image('grok-2-image'),
    prompt: 'A salamander at dusk in a forest pond surrounded by fireflies.',
  });

  await presentImages([image]);
}

main().catch(console.error);
