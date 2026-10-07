import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video, warnings } = await withSpinner(
    'Generating xAI video between pinned frames with audio...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video-1.5'),
        prompt:
          'The comic cat crosses the sunlit room and playfully transforms ' +
          'into the comic dog. Add light footsteps and cheerful room ambience.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
          {
            image: fs.readFileSync('data/comic-dog.png'),
            frameType: 'last_frame',
          },
        ],
        generateAudio: true,
        duration: 6,
        aspectRatio: '16:9',
        providerOptions: {
          xai: {
            pollTimeoutMs: 600_000,
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);
  await presentVideos([video]);
});
