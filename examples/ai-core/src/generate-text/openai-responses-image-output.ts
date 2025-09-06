import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const result1 = await generateText({
    model: openai('gpt-5'),
    prompt:
      'Generate an image of an echidna swimming across the Mozambique channel.',
    tools: {
      image_generation: openai.tools.imageGeneration({
        outputFormat: 'webp',
      }),
    },
  });

  console.log(result1.text);

  for (const file of result1.files) {
    if (file.mediaType.startsWith('image/')) {
      await presentImages([file]);
    }
  }

  const result2 = await generateText({
    model: openai('gpt-5'),
        messages: [
      ...(await result1.response).messages,
      { role: 'user', content: 'What is the weather there right now?' }
    ]
  });


  console.log(result2.text);
}

main().catch(console.error);
