import { minimax, type MiniMaxVideoModelOptions } from '@ai-sdk/minimax';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating MiniMax video with MiniMax-H3...',
    () =>
      generateVideo({
        model: minimax.video('MiniMax-H3'),
        prompt:
          'A white kitten chases a butterfly across a sunlit garden. Gentle camera tracking, natural movement.',
        aspectRatio: '16:9',
        duration: 5,
        providerOptions: {
          minimax: {
            resolution: '768P',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies MiniMaxVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
