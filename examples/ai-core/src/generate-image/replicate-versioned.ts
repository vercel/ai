import { replicate } from '@ai-sdk/replicate';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  const { image } = await generateImage({
    model: replicate.image(
      'bytedance/sdxl-lightning-4step:5599ed30703defd1d160a25a63321b4dec97101d98b4674bcc56e41f62f35637',
    ),
    prompt: 'The Loch Ness Monster getting a manicure',
  });

  await presentImages([image]);
}

main().catch(console.error);
