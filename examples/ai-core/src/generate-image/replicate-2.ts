import { replicate } from '@ai-sdk/replicate';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const { image } = await generateImage({
    model: replicate.image('black-forest-labs/flux-schnell'),
    prompt: 'The Loch Ness Monster getting a manicure',
    aspectRatio: '16:9',
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
