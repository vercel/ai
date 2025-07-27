import { fireworks } from '@ai-sdk/fireworks';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: fireworks.image(
      'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0',
    ),
    prompt: 'A burrito launched through a tunnel',
    size: '1024x1024',
    seed: 0,
    n: 2,
    providerOptions: {
      fireworks: {
        // https://fireworks.ai/models/fireworks/stable-diffusion-xl-1024-v1-0/playground
        cfg_scale: 10,
        steps: 30,
      },
    },
  });

  await presentImages(result.images);
}

main().catch(console.error);
