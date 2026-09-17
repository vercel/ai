import { replicate, type ReplicateImageModelOptions } from '@ai-sdk/replicate';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: replicate.image('black-forest-labs/flux-dev'),
    prompt: 'A watercolor landscape at twilight',
    size: '1024x1024',
    providerOptions: {
      replicate: {
        // Force Replicate to return before this model normally completes so
        // that the provider follows the prediction by polling urls.get.
        maxWaitTimeInSeconds: 1,
        pollIntervalMillis: 500,
        pollTimeoutMillis: 600_000,
      } satisfies ReplicateImageModelOptions,
    },
  });

  await presentImages(images);
});
