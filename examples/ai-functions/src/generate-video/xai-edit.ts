import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Editing video with xAI grok-imagine-video...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video'),
        prompt: 'Give the person sunglasses and a hat',
        providerOptions: {
          xai: {
            videoUrl: 'https://example.com/source-video.mp4',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  await presentVideos(videos);
});
