import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const { imageAsUint8Array: image } = await generateImage({
    model: openai.image('dall-e-2'),
    prompt: 'Santa Claus driving a Cadillac',
    size: '512x512',
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
