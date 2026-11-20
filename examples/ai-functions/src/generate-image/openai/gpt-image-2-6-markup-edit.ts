import { readFileSync } from 'node:fs';
import { openai, type OpenAIImageModelEditOptions } from '@ai-sdk/openai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const image = readFileSync('data/comic-cat.png');
  // transparent PNG with the same dimensions that marks up the regions to change
  const markup = readFileSync('data/comic-cat-markup.png');

  const { images } = await generateImage({
    model: openai.image('gpt-image-2.6-flare'),
    prompt: {
      text: "Make the cat's left ear, marked with the red circle and arrow, smaller. Keep everything else unchanged. Remove the red circle and arrow from the finished image.",
      images: [image],
    },
    providerOptions: {
      openai: {
        markup: `data:image/png;base64,${markup.toString('base64')}`,
      } satisfies OpenAIImageModelEditOptions,
    },
  });

  await presentImages(images);
});
