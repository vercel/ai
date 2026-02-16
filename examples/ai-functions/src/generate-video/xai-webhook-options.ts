import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { createSmeeWebhook } from '../lib/smee-webhook';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: xai.video('grok-imagine-video'),
      prompt: 'A yorkie among dandelions at Crissy Field in San Francisco.',
      aspectRatio: '16:9',
      duration: 5,
      providerOptions: {
        xai: {
          pollTimeoutMs: 600000, // 10 minutes
        } satisfies XaiVideoModelOptions,
      },
      webhook: async () => {
        const { url, received } = await createSmeeWebhook();
        console.log(`\nWaiting for webhook via ${url}`);
        return { url, received };
      },
    }),
  );

  await presentVideos(videos);
});
