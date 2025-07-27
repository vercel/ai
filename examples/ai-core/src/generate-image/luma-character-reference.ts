import { luma } from '@ai-sdk/luma';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: luma.image('photon-flash-1'),
    prompt: 'A woman with a cat riding a broomstick in a forest',
    aspectRatio: '1:1',
    providerOptions: {
      luma: {
        // https://docs.lumalabs.ai/docs/image-generation#character-reference
        character_ref: {
          identity0: {
            images: [
              'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/future-me-8hcBWcZOkbE53q3gshhEm16S87qDpF.jpeg',
            ],
          },
        },
      },
    },
  });

  await presentImages(result.images);
}

main().catch(console.error);
