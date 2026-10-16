import { readFileSync } from 'node:fs';
import { xai } from '@ai-sdk/xai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const imageBuffer = readFileSync('data/comic-cat.png');
  const maskBuffer = readFileSync('data/comic-cat-mask.png');

  console.log('INPUT IMAGE:');
  await presentImages([
    {
      uint8Array: new Uint8Array(imageBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  console.log('MASK IMAGE (white = edit region, black = keep):');
  await presentImages([
    {
      uint8Array: new Uint8Array(maskBuffer),
      base64: '',
      mediaType: 'image/png',
    },
  ]);

  const prompt = 'Replace the masked area with a sunflower field';
  console.log(`PROMPT: ${prompt}`);

  const { images } = await generateImage({
    model: xai.image('grok-imagine-image'),
    prompt: {
      text: prompt,
      images: [imageBuffer],
      mask: maskBuffer,
    },
  });

  console.log('OUTPUT IMAGE:');
  await presentImages(images);
});
