import 'dotenv/config';
import { fireworks } from '@ai-sdk/fireworks';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

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

  for (const [index, image] of result.images.entries()) {
    const filename = `image-${Date.now()}-${index}.png`;
    fs.writeFileSync(filename, image.uint8Array);
    console.log(`Image saved to ${filename}`);
  }
}

main().catch(console.error);
