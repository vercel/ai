import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating xAI image-to-video from a first frame...',
    () =>
      generateVideo({
        model: spacexai.video('grok-imagine-video'),
        prompt:
          'The comic cat stretches, yawns, and pads off across a sunlit room. ' +
          'Cinematic, warm afternoon light.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
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
