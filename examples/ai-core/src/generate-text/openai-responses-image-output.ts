import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const result = await generateText({
    model: openai('gpt-5'),
    prompt:
      'Generate an image of an echidna swimming across the Mozambique channel.',
    tools: {
      image_generation: openai.tools.generateImage({
        outputFormat: 'png',
      }),
    },
    providerOptions: {
      openai: {
        // Include partial frames if you want to preview progress in non-stream generate
        // (they will be returned in result.files as they arrive in order). Optional.
        include: ['image_generation_call.partials'],
      },
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
