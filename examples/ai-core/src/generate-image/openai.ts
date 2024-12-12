import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const { image } = await generateImage({
    model: openai.image('dall-e-3'),
    prompt: 'Santa Claus driving a Cadillac',
    size: '1024x1024',
    providerOptions: {
      openai: { style: 'vivid', quality: 'hd' },
    },
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
