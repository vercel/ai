import { fal } from '@ai-sdk/fal';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: fal.image('fal-ai/flux-pro/kontext/max'),
    prompt: 'Put a donut next to the flour.',
    providerOptions: {
      fal: {
        image_url:
          'https://v3.fal.media/files/rabbit/rmgBxhwGYb2d3pl3x9sKf_output.png',
      },
    },
  });
  await presentImages(images);
}

main().catch(console.error);
