import { type AlibabaVideoProviderOptions, alibaba } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating reference-to-video with wan2.6-r2v-flash...',
    () =>
      generateVideo({
        model: alibaba.video('wan2.6-r2v-flash'),
        prompt:
          'character1 walks through a beautiful garden and waves at the camera',
        resolution: '1280x720',
        duration: 5,
        providerOptions: {
          alibaba: {
            referenceUrls: ['https://example.com/reference-character.jpg'],
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies AlibabaVideoProviderOptions,
        },
      }),
  );

  await presentVideos([video]);
});
