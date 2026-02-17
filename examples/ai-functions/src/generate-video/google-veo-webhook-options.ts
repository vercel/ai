import { type GoogleVideoModelOptions, google } from '@ai-sdk/google';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

// Note: Google does not support webhooks natively. The SDK will log an
// unsupported-webhook warning and automatically fall back to polling.
run(async () => {
  const { video, warnings } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: google.video('veo-3.1-generate-preview'),
      prompt: 'A Bedlington Terrier leaping at Crissy Field at sunset.',
      aspectRatio: '16:9',
      duration: 6,
      providerOptions: {
        google: {
          pollTimeoutMs: 600000, // 10 minutes
        } satisfies GoogleVideoModelOptions,
      },
      webhook: async () => {
        throw new Error(
          'Webhooks are not supported by Google. This callback should not be invoked',
        );
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos([video]);
});
