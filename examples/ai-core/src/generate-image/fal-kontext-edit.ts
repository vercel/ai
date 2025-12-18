import { fal } from '@ai-sdk/fal';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: fal.image('fal-ai/flux-pro/kontext/max'),
    prompt: {
      text: 'Put a donut next to the flour.',
      images: [
        'https://v3.fal.media/files/rabbit/rmgBxhwGYb2d3pl3x9sKf_output.png',
      ],
    },
  });
  await presentImages(images);
}

main().catch(console.error);
