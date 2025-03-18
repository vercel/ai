import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const result = streamText({
    model: google('gemini-2.0-flash-exp'),
    prompt: 'Generate an image of a comic cat',
    providerOptions: {
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.textDelta);
        break;
      }

      case 'file': {
        if (part.mimeType.startsWith('image/')) {
          await presentImages([part]);
        }

        break;
      }
    }
  }
}

main().catch(console.error);
