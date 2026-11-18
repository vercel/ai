import { tencent } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  // Reference images and videos route kling-video-v4 to the omni endpoint.
  // They are numbered in order and can be referenced as @image_1, @video_1.
  const { videos } = await withSpinner(
    'Generating TokenHub Kling omni video with kling-video-v4...',
    () =>
      generateVideo({
        model: tencent.video('kling-video-v4'),
        prompt:
          'The cat from @image_1 sits in a sunny garden and looks around.',
        inputReferences: [
          {
            data: fs.readFileSync('data/comic-cat.png'),
            mediaType: 'image/png',
          },
        ],
        aspectRatio: '16:9',
        duration: 5,
        resolution: '1280x720',
        poll: { timeoutMs: 600000 },
      }),
  );

  await presentVideos(videos);
});
