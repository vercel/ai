import { google, GoogleGenerativeAIImageProviderOptions } from '@ai-sdk/google';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: google.image('imagen-4.0-generate-001'),
    prompt: 'A burrito launched through a tunnel',
    aspectRatio: '1:1',
    providerOptions: {
      google: {
        personGeneration: 'dont_allow',
      } satisfies GoogleGenerativeAIImageProviderOptions,
    },
  });

  await presentImages([image]);
}

main().catch(console.error);
