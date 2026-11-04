import { alibaba, type AlibabaVideoModelOptions } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// wan3 is the first Wan model with a real last_frame slot. Both frames go
// into input.media; older Wan models warn and drop last_frame.
run(async () => {
  const { video } = await withSpinner(
    'Generating first-to-last-frame video with wan3.0-video...',
    () =>
      generateVideo({
        model: alibaba.video('wan3.0-video'),
        prompt:
          'The scene starts on the opening frame and ends on the closing frame',
        resolution: '1280x720',
        duration: 5,
        frameImages: [
          {
            frameType: 'first_frame',
            image:
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
          },
          {
            frameType: 'last_frame',
            image:
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-dog.png',
          },
        ],
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
