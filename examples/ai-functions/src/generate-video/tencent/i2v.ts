import { tencent, type TencentVideoModelOptions } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating TokenHub Kling image-to-video with kling-video-v3...',
    () =>
      generateVideo({
        model: tencent.video('kling-video-v3'),
        prompt: {
          image:
            'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
          text: 'The cat slowly turns its head and blinks',
        },
        duration: 5,
        generateAudio: false,
        providerOptions: {
          tencent: {
            pollTimeoutMs: 600000,
            resolution: '720p',
          } satisfies TencentVideoModelOptions,
        },
      }),
  );

  await presentVideos(videos);
});
