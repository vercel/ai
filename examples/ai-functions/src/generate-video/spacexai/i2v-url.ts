import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating xAI image-to-video with grok-imagine-video...',
    () =>
      generateVideo({
        model: spacexai.video('grok-imagine-video'),
        prompt: {
          image:
            'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
          text: 'The cat slowly turns its head and blinks',
        },
        duration: 5,
        providerOptions: {
          spacexai: {
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies SpaceXAIVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
