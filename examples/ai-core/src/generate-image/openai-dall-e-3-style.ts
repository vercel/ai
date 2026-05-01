import { openai, type OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: openai.image('dall-e-3'),
    prompt:
      'A neon-lit cyberpunk alley in Osaka at night, with rain reflections',
    size: '1024x1792',
    providerOptions: {
      openai: {
        style: 'vivid',
        quality: 'hd',
      } satisfies OpenAIImageModelGenerationOptions,
    },
  });

  await presentImages([image]);
}

main().catch(console.error);
