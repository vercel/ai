import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: google('gemini-2.0-flash-exp'),
    prompt: 'Generate an image of a comic cat',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        process.stdout.write(part.text);
        break;
      }

      case 'file': {
        if (part.file.mediaType.startsWith('image/')) {
          await presentImages([part.file]);
        }

        break;
      }
    }
  }
});
