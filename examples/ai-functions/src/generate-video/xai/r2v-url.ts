import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating reference-to-video with xAI grok-imagine-video...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video'),
        prompt:
          'A golden retriever running through a sunlit meadow, cinematic slow motion',
        duration: 8,
        aspectRatio: '16:9',
        providerOptions: {
          xai: {
            referenceImages: [
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
            ],
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  await presentVideos(videos);
});
