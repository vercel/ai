import { minimax, type MiniMaxVideoModelOptions } from '@ai-sdk/minimax';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video, warnings, providerMetadata } = await withSpinner(
    'Generating MiniMax first-to-last keyframe transition...',
    () =>
      generateVideo({
        model: minimax.video('MiniMax-H3'),
        prompt:
          'A smooth morph from the comic cat into the comic bear, ' +
          'seamless transition, playful cartoon style.',
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
