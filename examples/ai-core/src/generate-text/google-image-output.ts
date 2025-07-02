import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const result = await generateText({
    model: google('gemini-2.0-flash-exp'),
    prompt: 'Generate an image of a comic cat',
    providerOptions: {
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    },
  });

  console.log(result.text);

  for (const file of result.files) {
    if (file.mediaType.startsWith('image/')) {
      await presentImages([file]);
    }
  }
}

main().catch(console.error);
