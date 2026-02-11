import { readFileSync } from 'node:fs';
import { xai } from '@ai-sdk/xai';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const imageBuffer = readFileSync('data/comic-cat.png');

  const { images } = await generateImage({
    model: xai.image('grok-imagine-image'),
    prompt: {
      text: 'Transform this into a pixel art golden retriever dog. Keep the exact same pixel art style, colors, and composition.',
      images: [imageBuffer],
    },
  });

  await presentImages(images);
});
