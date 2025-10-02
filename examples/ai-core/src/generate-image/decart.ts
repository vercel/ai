import { decart } from '@ai-sdk/decart';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: decart.image('lucy-pro-t2i'),
    prompt: 'Three dogs playing in the snow',
  });

  await presentImages(result.images);
}

main().catch(console.error);
