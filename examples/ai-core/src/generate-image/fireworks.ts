import 'dotenv/config';
import { fireworks } from '@ai-sdk/fireworks';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

async function main() {
  const { image } = await generateImage({
    model: fireworks.image('accounts/fireworks/models/flux-1-dev-fp8'),
    prompt: 'A burrito launched through a tunnel',
    providerOptions: {
      fireworks: {
        // https://fireworks.ai/models/fireworks/flux-1-dev-fp8/playground
        aspect_ratio: '1:1',
        guidance_scale: 10,
        num_inference_steps: 10,
        seed: 0,
      },
    },
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
