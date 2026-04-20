import { type AlibabaVideoModelOptions, alibaba } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating reference-to-video with wan2.6-r2v...',
    () =>
      generateVideo({
        model: alibaba.video('wan2.6-r2v'),
        prompt: 'comic cat and comic dog have a conversation in a cozy cafe',
        resolution: '1920x1080',
        duration: 4,
        providerOptions: {
          alibaba: {
            referenceUrls: [
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-dog.png',
            ],
            shotType: 'single',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies AlibabaVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
