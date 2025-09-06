import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { presentImages } from '../lib/present-image';

async function main() {
  const result1 = streamText({
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

  for await (const part of result1.fullStream) {
    if (part.type == 'file' && part.file.mediaType.startsWith('image/')) {
      console.log('Image part', {
        mediaType: part.file.mediaType,
        length: part.file.base64.length,
      });
      await presentImages([part.file]);
    }
  }

  console.log();
  console.log('Finish reason:', await result1.finishReason);
  console.log('Usage:', await result1.usage);
  console.log();
  console.log((await result1.request).body);

  // make sure that multi-turn messages work
  const result2 = streamText({
    model: openai('gpt-5'),
    messages: [
      ...(await result1.response).messages,
      { role: 'user', content: 'What is the weather there right now?' }
    ],
  });

  console.log();
  console.log('Finish reason:', await result2.finishReason);
  console.log('Usage:', await result2.usage);
  console.log();
  console.log((await result2.request).body);
}

main().catch(console.error);
