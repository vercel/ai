import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

// Note: xAI does not support webhooks natively. The SDK will log an
// unsupported-webhook warning and automatically fall back to polling.
run(async () => {
  const { videos, warnings } = await withSpinner('Generating video...', () =>
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
        throw new Error(
          'Webhooks are not supported by xAI. This callback should not be invoked',
        );
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos(videos);
});
