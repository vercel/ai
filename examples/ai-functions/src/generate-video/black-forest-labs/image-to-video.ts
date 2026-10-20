import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Image-to-video: a single image becomes the frame that opens the clip.
run(async () => {
  const { video, warnings } = await withSpinner(
    'Generating FLUX 3 image-to-video from an opening frame...',
    () =>
      generateVideo({
        model: blackForestLabs.video('flux-3-video'),
        prompt:
          'The comic cat stretches, yawns, and pads off across a sunlit room. ' +
          'Cinematic, warm afternoon light, gentle camera push-in.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
        ],
        duration: 5,
        poll: { timeoutMs: 600_000 }, // 10 minutes
      }),
  );

  console.log('Warnings:', warnings);
  await presentVideos([video]);
});
