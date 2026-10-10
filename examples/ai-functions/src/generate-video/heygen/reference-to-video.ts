import { heygen } from '@ai-sdk/heygen';
import { experimental_generateVideo as generateVideo } from 'ai';
import { readFile } from 'node:fs/promises';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating from a reference with HeyGen...',
    async () =>
      generateVideo({
        model: heygen.video('heygen-video-1'),
        prompt:
          'The character in <Picture 1> walks through a quiet garden. Keep its appearance consistent. Birds chirp softly.',
        inputReferences: [
          {
            mediaType: 'image/png',
            data: await readFile('data/comic-cat.png'),
          },
        ],
        duration: 5,
        aspectRatio: '16:9',
      }),
  );
  await presentVideos(videos);
});
