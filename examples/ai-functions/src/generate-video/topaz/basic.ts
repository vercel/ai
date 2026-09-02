import { topaz, type TopazVideoModelOptions } from '@ai-sdk/topaz';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Enhancing video with Starlight Precise 2.6...',
    () =>
      generateVideo({
        model: topaz.video('starlight-precise-2.6'),
        // Topaz enhances a video you supply; pass it as an input reference.
        inputReferences: [
          'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/prudence.mp4',
        ],
        providerOptions: {
          topaz: {
            // Topaz needs the input video's properties before the upload
            // starts, and the AI SDK does not inspect media files.
            source: {
              width: 1920,
              height: 1080,
              duration: 10,
              frameRate: 30,
              frameCount: 300,
            },
            output: { width: 3840, height: 2160 },
            sharpness: 4,
          } satisfies TopazVideoModelOptions,
        },
      }),
  );

  await presentVideos(videos);
});
