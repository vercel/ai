import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating xAI reference-to-video with grok-imagine-video...',
    () =>
      generateVideo({
        model: spacexai.video('grok-imagine-video'),
        prompt:
          '<IMAGE_1> and <IMAGE_2> ' +
          'are having a playful chase through a sunlit park. ' +
          'Cinematic slow-motion, warm afternoon light.',
        inputReferences: [
          fs.readFileSync('data/comic-cat.png'),
          fs.readFileSync('data/comic-dog.png'),
        ],
        duration: 8,
        aspectRatio: '16:9',
        providerOptions: {
          spacexai: {
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies SpaceXAIVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
