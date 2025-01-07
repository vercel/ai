import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const { images } = await generateImage({
    model: openai.image('dall-e-3'),
    n: 3, // 3 calls; dall-e-3 can only generate 1 image at a time
    prompt: 'Santa Claus driving a Cadillac',
  });

  for (const image of images) {
    const filename = `image-${Date.now()}.png`;
    fs.writeFileSync(filename, image.uint8Array);
    console.log(`Image saved to ${filename}`);
  }
}

main().catch(console.error);
