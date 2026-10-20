import {
  createReplicate,
  type ReplicateImageModelOptions,
} from '@ai-sdk/replicate';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  let pollCount = 0;
  const replicate = createReplicate({
    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      const method =
        init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (
        method === 'GET' &&
        url.startsWith('https://api.replicate.com/v1/predictions/')
      ) {
        pollCount++;
      }

      return globalThis.fetch(input, init);
    },
  });

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
        maxPollAttempts: 240,
      } satisfies ReplicateImageModelOptions,
    },
  });

  if (pollCount === 0) {
    throw new Error(
      'Expected the prediction to require polling, but it completed within the synchronous wait duration.',
    );
  }

  console.log(`Prediction completed after ${pollCount} polling requests.`);
  await presentImages(images);
});
