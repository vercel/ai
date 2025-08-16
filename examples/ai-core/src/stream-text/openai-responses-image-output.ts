import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { presentImages } from '../lib/present-image';

async function main() {
  const result = streamText({
    model: openai('gpt-5'),
    prompt:
      'Generate an image of an echidna swimming across the Mozambique channel.',
    tools: {
      image_generation: openai.tools.generateImage({
        outputFormat: 'webp',
        quality: 'low',
      }),
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
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log();
  console.log((await result.request).body);
}

main().catch(console.error);
