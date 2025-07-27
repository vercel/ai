import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { images } = await generateImage({
    model: openai.image('dall-e-3'),
    n: 3, // 3 calls; dall-e-3 can only generate 1 image at a time
    prompt: 'Santa Claus driving a Cadillac',
  });

  await presentImages(images);
}

main().catch(console.error);
