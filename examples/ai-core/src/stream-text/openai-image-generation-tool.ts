import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { convertBase64ToUint8Array } from '../lib/convertBase64ToUint8Array';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-5'),
    prompt:
      'Generate an image of an echidna swimming across the Mozambique channel.',
    tools: {
      image_generation: openai.tools.imageGeneration({
        outputFormat: 'webp',
        quality: 'low',
      }),
    },
  });

  for await (const part of result.fullStream) {
    if (part.type == 'tool-result' && !part.dynamic) {
      await presentImages([
        {
          mediaType: 'image/webp',
          base64: part.output.result,
          uint8Array: convertBase64ToUint8Array(part.output.result),
        },
      ]);
    }
  }
});
