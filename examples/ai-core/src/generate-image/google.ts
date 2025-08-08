import { google, GoogleGenerativeAIImageProviderOptions } from '@ai-sdk/google';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: google.image('imagen-3.0-generate-002'),
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
