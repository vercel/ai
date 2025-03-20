import { fal } from '@ai-sdk/fal';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: fal.image('fal-ai/fast-lcm-diffusion'), // either model here
    prompt: 'A serene mountain landscape at sunset',
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
