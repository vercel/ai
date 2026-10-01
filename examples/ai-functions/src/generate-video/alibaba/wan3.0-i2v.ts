import { alibaba, type AlibabaVideoModelOptions } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// wan3 has no -i2v id. A start image on the request becomes input.media
// first_frame and switches the generation into image-to-video.
run(async () => {
  const { video } = await withSpinner(
    'Generating image-to-video with wan3.0-video...',
    () =>
      generateVideo({
        model: alibaba.video('wan3.0-video'),
        prompt: {
          image:
            'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
          text: 'The cat slowly turns its head and blinks',
        },
        resolution: '1280x720',
        duration: 5,
        generateAudio: true,
        providerOptions: {
          alibaba: {
            ratio: 'adaptive',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies AlibabaVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
