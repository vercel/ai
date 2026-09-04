import { alibaba, type AlibabaVideoModelOptions } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// wan3 serves every mode from one model id, so the media on the request — not a
// `-i2v`/`-r2v` suffix — decides what gets generated. This one combines both
// frames with references, and lets the model pick the duration (`-1`).
run(async () => {
  const { video } = await withSpinner(
    'Generating video with wan3.0-video...',
    () =>
      generateVideo({
        model: alibaba.video('wan3.0-video'),
        prompt:
          'Image 1 walks toward Image 2 across a cozy cafe, ending on the closing frame',
        resolution: '1920x1080',
        duration: -1, // smart duration: the model picks, up to 30s
        generateAudio: true,
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
