import { bedrock } from '@ai-sdk/amazon-bedrock';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: bedrock.imageModel('amazon.nova-canvas-v1:0'),
    prompt:
      'A salamander at dusk in a forest pond with fireflies in the background, in the style of anime',
    size: '512x512',
    seed: 42,
    providerOptions: {
      bedrock: {
        quality: 'premium',
      },
    },
  });

  await presentImages(result.images);
}

main().catch(console.error);
