import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const result = await generateText({
    model: google('gemini-2.0-flash-exp'),
    prompt: 'Generate an image of a comic cat',
    providerOptions: {
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    },
  });

  console.log(result.text);

  if (result.images.length > 0) {
    for (const image of result.images) {
      await presentImages([image]);
    }
  }
}

main().catch(console.error);
