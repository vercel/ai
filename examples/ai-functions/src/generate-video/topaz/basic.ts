import { topaz, type TopazVideoModelOptions } from '@ai-sdk/topaz';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Enhancing video with Starlight Precise 2.6...',
    () =>
      generateVideo({
        model: topaz.video('starlight-precise-2.6'),
        // generateVideo requires a prompt, but Topaz only enhances the input.
        prompt: '',
        inputReferences: [
          'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/prudence.mp4',
        ],
        providerOptions: {
          topaz: {
            // Topaz needs the input video's properties before the upload
            // starts, and the AI SDK does not inspect media files.
            source: {
              width: 360,
              height: 640,
              duration: 5.133,
              frameRate: 30,
              frameCount: 154,
            },
            output: { width: 1080, height: 1920 },
            sharpness: 4,
          } satisfies TopazVideoModelOptions,
        },
      }),
  );

  // `topaz.credits` is the lower bound of the post-upload estimate, which is
  // what Topaz bills.
  console.log('Provider metadata:', JSON.stringify(providerMetadata, null, 2));
  await presentVideos(videos);
});
