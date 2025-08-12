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
        outputFormat: 'webp',
      }),
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
