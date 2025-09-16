import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-5-nano'),
    prompt: 'Generate an image of a cat.',
    tools: {
      image_generation: openai.tools.imageGeneration({
        outputFormat: 'webp',
        quality: 'low',
        size: '1024x1024',
      }),
    },
  });

  for (const file of result.files) {
    if (file.mediaType.startsWith('image/')) {
      await presentImages([file]);
    }
  }
});
