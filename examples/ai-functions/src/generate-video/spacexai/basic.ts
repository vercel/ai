import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating xAI video with grok-imagine-video...',
    () =>
      generateVideo({
        model: spacexai.video('grok-imagine-video'),
        prompt: 'A yorkie among dandelions at Crissy Field in San Francisco.',
        aspectRatio: '16:9',
        duration: 5,
        providerOptions: {
          spacexai: {
            user: 'example-user-123',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies SpaceXAIVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
