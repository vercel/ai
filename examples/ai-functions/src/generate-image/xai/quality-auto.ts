import { xai, type XaiImageModelOptions } from '@ai-sdk/xai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: xai.image('grok-imagine-image-2.0'),
    prompt: 'A salamander at dusk in a forest pond surrounded by fireflies.',
    providerOptions: {
      xai: {
        quality: 'auto',
      } satisfies XaiImageModelOptions,
    },
  });

  await presentImages([image]);
});
