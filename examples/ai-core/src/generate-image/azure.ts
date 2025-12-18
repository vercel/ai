import { azure } from '@ai-sdk/azure';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: azure.imageModel('gpt-image-1'), // Use your own deployment
    prompt: 'Santa Claus driving a Cadillac',
  });

  await presentImages([image]);
}

main().catch(console.error);
