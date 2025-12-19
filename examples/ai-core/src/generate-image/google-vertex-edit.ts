import { readFileSync } from 'node:fs';
import {
  GoogleVertexImageProviderOptions,
  vertex,
} from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';
import 'dotenv/config';

run(async () => {
  const image = readFileSync('data/sunlit_lounge.png');
  const mask = readFileSync('data/sunlit_lounge_mask_black_white.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(image),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt =
    'A sunlit indoor lounge area with a pool containing a flamingo';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: vertex.image('imagen-3.0-capability-001'),
    prompt: {
      text: prompt,
      images: [image],
      mask,
    },
    providerOptions: {
      vertex: {
        edit: {
          baseSteps: 50,
          mode: 'EDIT_MODE_INPAINT_INSERTION',
          maskMode: 'MASK_MODE_USER_PROVIDED',
          maskDilation: 0.01,
        },
      } satisfies GoogleVertexImageProviderOptions,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
});
