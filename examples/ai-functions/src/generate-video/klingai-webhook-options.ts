import { type KlingAIVideoModelOptions, klingai } from '@ai-sdk/klingai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

// Note: KlingAI does not support webhooks natively. The SDK will log an
// unsupported-webhook warning and automatically fall back to polling.
run(async () => {
  const { videos, warnings } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: klingai.video('kling-v2.6-t2v'),
      prompt: 'A chicken flying into the sunset in the style of 90s anime.',
      aspectRatio: '16:9',
      duration: 5,
      providerOptions: {
        klingai: {
          mode: 'std',
          pollTimeoutMs: 600000, // 10 minutes
        } satisfies KlingAIVideoModelOptions,
      },
      webhook: async () => {
        throw new Error(
          'Webhooks are not supported by KlingAI. This callback should not be invoked',
        );
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos(videos);
});
