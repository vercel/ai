import { spacexai } from '@ai-sdk/spacexai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image, providerMetadata } = await generateImage({
    model: spacexai.image('grok-imagine-image'),
    prompt:
      'A serene mountain lake at sunrise with mist rising from the water.',
    providerOptions: {
      spacexai: {
        quality: 'high',
        user: 'example-user-123',
      },
    },
  });

  await presentImages([image]);

  // Log cost metadata if available
  const costInUsdTicks = (providerMetadata?.spacexai as Record<string, unknown>)
    ?.costInUsdTicks as number | undefined;
  if (costInUsdTicks != null) {
    console.log(
      `Cost: ${costInUsdTicks} USD ticks ($${(costInUsdTicks / 1_000_000).toFixed(6)})`,
    );
  }
});
