import { blackForestLabs } from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Video continuation: FLUX 3 picks up from the final frames of an existing mp4.
run(async () => {
  const { video, warnings } = await withSpinner(
    'Continuing an existing clip with FLUX 3...',
    () =>
      generateVideo({
        model: blackForestLabs.video('flux-3-video'),
        prompt:
          'Continue the scene: the camera keeps drifting forward as the light ' +
          'softens toward evening.',
        inputReferences: [
          {
            data: fs.readFileSync('data/prudence.mp4'),
            mediaType: 'video/mp4',
          },
        ],
        duration: 10,
        poll: { timeoutMs: 600_000 }, // 10 minutes
      }),
  );

  console.log('Warnings:', warnings);
  await presentVideos([video]);
});
