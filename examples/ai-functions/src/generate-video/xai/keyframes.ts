import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video, warnings } = await withSpinner(
    'Generating xAI video with timed keyframes...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video-1.5'),
        prompt:
          'A continuous animated shot moves from a curious cat to a happy ' +
          'dog and ends on a wise owl, all in the same sunlit room.',
        duration: 6,
        aspectRatio: '16:9',
        providerOptions: {
          xai: {
            keyframes: [
              {
                imageUrl:
                  'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
                timestampSeconds: 1.5,
              },
              {
                imageUrl:
                  'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-dog.png',
                timestampSeconds: 3,
              },
              {
                imageUrl:
                  'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-owl.png',
                timestampSeconds: 4.5,
              },
            ],
            pollTimeoutMs: 600_000,
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);
  await presentVideos([video]);
});
