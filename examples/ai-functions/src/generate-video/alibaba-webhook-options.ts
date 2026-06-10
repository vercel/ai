import { type AlibabaVideoModelOptions, alibaba } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

// Note: Alibaba does not support webhooks natively. The SDK will log an
// unsupported-webhook warning and automatically fall back to polling.
run(async () => {
  const { video, warnings } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: alibaba.video('wan2.6-t2v'),
      prompt: 'A chicken flying into the sunset in the style of 90s anime.',
      resolution: '1280x720',
      duration: 5,
      providerOptions: {
        alibaba: {
          promptExtend: true,
          pollTimeoutMs: 600000, // 10 minutes
        } satisfies AlibabaVideoModelOptions,
      },
      webhook: async () => {
        throw new Error(
          'Webhooks are not supported by Alibaba. This callback should not be invoked',
        );
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos([video]);
});
