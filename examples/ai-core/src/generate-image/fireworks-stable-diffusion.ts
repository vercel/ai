import 'dotenv/config';
import { fireworks } from '@ai-sdk/fireworks';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

async function main() {
  const { image } = await generateImage({
    model: fireworks.image('accounts/stability/models/sd3-turbo'),
    prompt: 'A burrito launched through a tunnel',
    aspectRatio: '1:1',
    providerOptions: {
      fireworks: {
        // https://fireworks.ai/models/stability/sd3-turbo/playground
        seed: 123,
        output_format: 'jpeg',
      },
    },
  });

  const filename = `image-${Date.now()}.jpeg`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
