import { togetherai } from '@ai-sdk/togetherai';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: togetherai.image('black-forest-labs/FLUX.1-dev'),
    prompt: 'A delighted resplendent quetzal mid flight amidst raindrops',
    size: '1024x1024',
    providerOptions: {
      togetherai: {
        // Together AI specific options
        steps: 40,
      },
    },
  });

  await presentImages(result.images);
}

main().catch(console.error);
