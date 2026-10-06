import { byteDance, type ByteDanceVideoModelOptions } from '@ai-sdk/bytedance';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating video from a prompt image and an additional reference image...',
    () =>
      generateVideo({
        model: byteDance.video('dreamina-seedance-2-0-260128'),
        prompt: {
          image:
            'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
          text: 'Create a vertical animated scene featuring the cat from [Image 1] and the dog from [Image 2] playing together.',
        },
        aspectRatio: '9:16',
        duration: 4,
        resolution: '480x864',
        providerOptions: {
          bytedance: {
            referenceImages: [
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-dog.png',
            ],
            watermark: false,
          } satisfies ByteDanceVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
