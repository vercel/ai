import { readFileSync } from 'node:fs';
import { prodia } from '@ai-sdk/prodia';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating H3 fast video...', () =>
    generateVideo({
      model: prodia.video('inference.minimax.h3.fast.ref2vid.v1'),
      prompt: 'The same cat walks through a sunlit garden, birds chirping',
      inputReferences: [
        { data: readFileSync('data/comic-cat.png'), mediaType: 'image/png' },
      ],
      duration: 4,
    }),
  );
  await presentVideos(videos);
});
