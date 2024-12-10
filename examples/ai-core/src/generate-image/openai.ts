import { openai } from '@ai-sdk/openai';
import { generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const { imageAsUint8Array: image } = await generateImage({
    model: openai.image('dall-e-2'),
    prompt: 'Santa Claus driving a Cadillac',
    size: '512x512',
    maxRetries: 0,
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
