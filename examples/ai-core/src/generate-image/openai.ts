import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: openai.image('dall-e-3'),
    prompt: 'Santa Claus driving a Cadillac',
  });

  await presentImages([image]);
}

main().catch(console.error);
