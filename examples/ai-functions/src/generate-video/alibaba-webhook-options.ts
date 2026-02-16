import { type AlibabaVideoModelOptions, alibaba } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { createWebhook } from '../lib/create-webhook';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner('Generating video...', () =>
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
        const { url, received } = await createWebhook();
        console.log(`\nWaiting for webhook via ${url}`);
        return { url, received };
      },
    }),
  );

  await presentVideos([video]);
});
