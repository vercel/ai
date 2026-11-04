import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Two keyframes: the first opens the clip and the second closes it, so FLUX 3
// interpolates a transition between the two characters.
run(async () => {
  const { video, warnings } = await withSpinner(
    'Generating FLUX 3 video between a first and last frame...',
    () =>
      generateVideo({
        model: blackForestLabs.video('flux-3-video'),
        prompt:
          'The cat trots across a sunlit room and settles beside the bear. ' +
          'Smooth continuous motion, warm afternoon light.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
          {
            image: fs.readFileSync('data/comic-bear.png'),
            frameType: 'last_frame',
          },
        ],
        duration: 6,
        poll: { timeoutMs: 600_000 }, // 10 minutes
      }),
  );

  console.log('Warnings:', warnings);
  await presentVideos([video]);
});
