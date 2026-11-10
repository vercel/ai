import { tencent } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating TokenHub Kling first-and-last-frame video with kling-video-v3...',
    () =>
      generateVideo({
        model: tencent.video('kling-video-v3'),
        prompt: 'The cartoon cat slowly transforms into a cartoon dog.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
          {
            image: fs.readFileSync('data/comic-dog.png'),
            frameType: 'last_frame',
          },
        ],
        duration: 5,
        resolution: '1280x720',
        generateAudio: false,
        providerOptions: { tencent: { pollTimeoutMs: 600000 } },
      }),
  );

  await presentVideos(videos);
});
