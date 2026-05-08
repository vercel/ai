import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: google.interactions('gemini-3-pro-image-preview'),
    prompt: 'Generate an image of a comic cat in a spaceship.',
    providerOptions: {
      google: {
        responseModalities: ['image'],
      },
    },
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

  console.log();
  console.log(
    'Interaction id:',
    (await result.finalStep).providerMetadata?.google?.interactionId,
  );
});
