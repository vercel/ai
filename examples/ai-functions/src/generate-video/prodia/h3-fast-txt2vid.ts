import { prodia } from '@ai-sdk/prodia';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating H3 fast video...', () =>
    generateVideo({
      model: prodia.video('inference.minimax.h3.fast.txt2vid.v1'),
      prompt:
        'A red fox walks through a snowy forest, snow crunching underfoot',
      aspectRatio: '16:9',
      seed: 0,
      duration: 4,
    }),
  );
  await presentVideos(videos);
});
