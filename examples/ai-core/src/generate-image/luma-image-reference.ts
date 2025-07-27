import { luma } from '@ai-sdk/luma';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: luma.image('photon-flash-1'),
    prompt: 'A salamander at dusk in a forest pond, in the style of ukiyo-e',
    aspectRatio: '1:1',
    providerOptions: {
      luma: {
        // https://docs.lumalabs.ai/docs/image-generation#image-reference
        image_ref: [
          {
            url: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/future-me-8hcBWcZOkbE53q3gshhEm16S87qDpF.jpeg',
            weight: 0.8,
          },
        ],
      },
    },
  });

  await presentImages(result.images);
}

main().catch(console.error);
