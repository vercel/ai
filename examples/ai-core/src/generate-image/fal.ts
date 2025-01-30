import { fal } from '@ai-sdk/fal';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const { image } = await generateImage({
    model: fal.image('fal-ai/flux/schnell'),
    prompt: 'A cat wearing a intricate robe',
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
