import { openai, type OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: openai.image('gpt-image-2.6-flare'),
    prompt: 'A red panda waving hello, flat illustration',
    providerOptions: {
      openai: {
        outputFormat: 'gif',
        frameCount: 9,
        frameDurationMs: 200,
      } satisfies OpenAIImageModelGenerationOptions,
    },
  });

  await presentImages([image]);
});
