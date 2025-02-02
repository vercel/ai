import { luma } from '@ai-sdk/luma';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'fs';

async function main() {
  const result = await generateImage({
    model: luma.image('photon-flash-1'),
    prompt: 'A blue cream Persian cat launching its website on Vercel',
    aspectRatio: '1:1',
    providerOptions: {
      luma: {
        // https://docs.lumalabs.ai/docs/image-generation#style-reference
        style_ref: [
          {
            url: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/future-me-8hcBWcZOkbE53q3gshhEm16S87qDpF.jpeg',
            weight: 0.8,
          },
        ],
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
