import { alibaba, type AlibabaVideoModelOptions } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating text-to-video with wan3.0-video...',
    () =>
      generateVideo({
        model: alibaba.video('wan3.0-video'),
        prompt:
          'A chicken flying into the sunset in the style of 90s anime. ' +
          'The camera slowly pans up as the sky turns gold.',
        resolution: '1920x1080',
        aspectRatio: '16:9',
        duration: 5,
        generateAudio: true,
        providerOptions: {
          alibaba: {
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies AlibabaVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
