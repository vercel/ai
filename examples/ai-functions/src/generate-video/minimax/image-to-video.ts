import { minimax, type MiniMaxVideoModelOptions } from '@ai-sdk/minimax';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Image-to-video: a single input image becomes the opening frame that H3
// animates. A lone `first_frame` maps to MiniMax's image-to-video mode.
run(async () => {
  const { video, warnings, providerMetadata } = await withSpinner(
    'Generating MiniMax image-to-video from a first frame...',
    () =>
      generateVideo({
        model: minimax.video('MiniMax-H3'),
        prompt:
          'The comic cat stretches, yawns, and pads off across a sunlit room. ' +
          'Cinematic, warm afternoon light, gentle camera push-in.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
        ],
        // No `aspectRatio`: in frame-image mode H3 derives the ratio from the
        // supplied image, and an explicit ratio is dropped with a warning.
        duration: 5,
        providerOptions: {
          minimax: {
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies MiniMaxVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);
  console.log('Provider metadata:', providerMetadata);
  await presentVideos([video]);
});
