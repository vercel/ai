import { type GoogleVideoModelOptions, google } from '@ai-sdk/google';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { createWebhook } from '../lib/create-webhook';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
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
        const { url, received } = await createWebhook();
        console.log(`\nWaiting for webhook via ${url}`);
        return { url, received };
      },
    }),
  );

  await presentVideos([video]);
});
