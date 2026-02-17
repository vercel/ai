import { type ReplicateVideoModelOptions, replicate } from '@ai-sdk/replicate';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { createWebhook } from '../lib/create-webhook';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video, warnings } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
      model: replicate.video('minimax/video-01'),
      prompt: 'A bumblebee on a dandelion in Bali surrounded by pollen dust.',
      aspectRatio: '16:9',
      providerOptions: {
        replicate: {
          pollTimeoutMs: 600000, // 10 minutes
        } satisfies ReplicateVideoModelOptions,
      },
      webhook: async () => {
        const { url, received } = await createWebhook();
        console.log(`\nWaiting for webhook via ${url}`);
        return { url, received };
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos([video]);
});
