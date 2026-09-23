import { type KlingAIVideoModelOptions, klingai } from '@ai-sdk/klingai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// KlingAI callbacks need a progress-aware receiver. This example demonstrates
// the generic webhook option falling back to polling without calling the factory.
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
          'KlingAI requires a progress-aware receiver. This factory should not be invoked.',
        );
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos(videos);
});
