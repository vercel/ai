import { type AlibabaVideoProviderOptions, alibaba } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating reference-to-video with wan2.6-r2v...',
    () =>
      generateVideo({
        model: alibaba.video('wan2.6-r2v'),
        prompt: 'character1 and character2 have a conversation in a cozy cafe',
        resolution: '1920x1080',
        duration: 8,
        providerOptions: {
          alibaba: {
            referenceUrls: [
              'https://example.com/character1.jpg',
              'https://example.com/character2.jpg',
            ],
            shotType: 'multi',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies AlibabaVideoProviderOptions,
        },
      }),
  );

  await presentVideos([video]);
});
