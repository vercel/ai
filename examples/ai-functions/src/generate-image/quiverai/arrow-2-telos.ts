import { quiverai, type QuiverAIImageModelOptions } from '@ai-sdk/quiverai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images, usage } = await generateImage({
    model: quiverai.image('arrow-2-telos'),
    prompt: 'A geometric compass icon with precise line work',
    providerOptions: {
      quiverai: {
        reasoningEffort: 'high',
        attributes: {
          viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
        },
        maxOutputTokens: 4096,
      } satisfies QuiverAIImageModelOptions,
    },
  });

  await presentImages(images);
  console.log('Token usage:', usage);
});
