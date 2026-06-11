import { openai, type OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: openai.image('gpt-image-2'),
    prompt: 'A red panda barista pouring latte art in a cozy Tokyo cafe',
    providerOptions: {
      openai: {
        outputFormat: 'webp',
        outputCompression: 75,
        moderation: 'low',
      } satisfies OpenAIImageModelGenerationOptions,
    },
  });

  await presentImages([image]);
}

main().catch(console.error);
