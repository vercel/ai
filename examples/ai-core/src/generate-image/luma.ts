import { luma } from '@ai-sdk/luma';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const result = await generateImage({
    model: luma.image('photon-flash-1'),
    prompt: 'A salamander at dusk in a forest pond, in the style of ukiyo-e',
    aspectRatio: '1:1',
    providerOptions: {
      luma: {
        // add'l options here
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
