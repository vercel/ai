import { xai } from '@ai-sdk/xai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image, providerMetadata } = await generateImage({
    model: xai.image('grok-2-image'),
    prompt:
      'A serene mountain lake at sunrise with mist rising from the water.',
    providerOptions: {
      xai: {
        quality: 'hd',
        user: 'example-user-123',
      },
    },
  });

  await presentImages([image]);

  // Log cost metadata if available
  if (providerMetadata?.xai?.costInUsdTicks != null) {
    console.log(
      `Cost: ${providerMetadata.xai.costInUsdTicks} USD ticks ($${(providerMetadata.xai.costInUsdTicks / 1_000_000).toFixed(6)})`,
    );
  }
});
