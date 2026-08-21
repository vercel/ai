import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Editing video with xAI grok-imagine-video...',
    () =>
      generateVideo({
        model: spacexai.video('grok-imagine-video'),
        prompt: 'Render this cat as a dog in the style of 90s anime.',
        providerOptions: {
          spacexai: {
            mode: 'edit-video',
            videoUrl:
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/prudence.mp4',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies SpaceXAIVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
