import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { presentImages } from '../lib/present-image';

async function main() {
  console.log('Starting...');
  const result = streamText({
    model: openai('gpt-5'),
    prompt:
      'Generate an image of an echidna swimming across the Mozambique channel.',
    // 'Generate an image of a turtle sunning itself on a log at sunrise in Madagascar.',
    // 'Generate an image of a yorkie drinking a tequila sunrise at Santa Monica Beach at sunset.',
    // 'Generate an image of a salamander at dusk in a forest pond surrounded by fireflies.',
    tools: {
      image_generation: openai.tools.generateImage({
        outputFormat: 'png',
        quality: 'low',
      }),
    },
    providerOptions: {
      openai: {
        include: ['image_generation_call.partials'],
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type == 'file' && part.file.mediaType.startsWith('image/')) {
      console.log('Image part', {
        mediaType: part.file.mediaType,
        length: part.file.base64.length,
      });
      await presentImages([part.file]);
    }
  }

  console.log();
  // Expect to see the format param in outbound.
  console.log(
    'REQUEST BODY',
    JSON.stringify((await result.request).body, null, 2),
  );
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log();
  console.log((await result.request).body);
}

main().catch(console.error);
