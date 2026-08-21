import { spacexai, type SpaceXAIImageModelOptions } from '@ai-sdk/spacexai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: spacexai.image('grok-imagine-image'),
    prompt: 'A salamander at dusk in a forest pond surrounded by fireflies.',
    providerOptions: {
      spacexai: {
        resolution: '2k',
      } satisfies SpaceXAIImageModelOptions,
    },
  });

  await presentImages([image]);
});
