import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Extending video with xAI grok-imagine-video...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video'),
        prompt:
          'The camera slowly zooms out to reveal the city skyline at sunset',
        duration: 6,
        providerOptions: {
          xai: {
            extensionVideoUrl:
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/prudence.mp4',
            pollTimeoutMs: 1200000, // 20 minutes
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  await presentVideos(videos);
});
