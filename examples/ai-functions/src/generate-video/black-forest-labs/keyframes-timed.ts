import {
  blackForestLabs,
  type BlackForestLabsVideoModelOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// More than two keyframes, each pinned to a second of the clip.
const asBase64 = (file: string) => fs.readFileSync(file).toString('base64');

run(async () => {
  const { video, warnings } = await withSpinner(
    'Generating FLUX 3 video from timed keyframes...',
    () =>
      generateVideo({
        model: blackForestLabs.video('flux-3-video'),
        prompt:
          'The cat, then the dog, then the owl each take a turn in the sunlit ' +
          'room. Continuous camera, warm afternoon light.',
        duration: 12,
        providerOptions: {
          blackForestLabs: {
            keyframes: [
              [0, asBase64('data/comic-cat.png')],
              [4.5, asBase64('data/comic-dog.png')],
              [9, asBase64('data/comic-owl.png')],
            ],
          } satisfies BlackForestLabsVideoModelOptions,
        },
        poll: { timeoutMs: 600_000 }, // 10 minutes
      }),
  );

  console.log('Warnings:', warnings);
  await presentVideos([video]);
});
