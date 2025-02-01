import { togetherai } from '@ai-sdk/togetherai';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

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

  for (const [index, image] of result.images.entries()) {
    const filename = `image-${Date.now()}-${index}.png`;
    fs.writeFileSync(filename, image.uint8Array);
    console.log(`Image saved to ${filename}`);
  }
}

main().catch(console.error);
