import { topaz, type TopazVideoModelOptions } from '@ai-sdk/topaz';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Enhancing video with Proteus...',
    () =>
      generateVideo({
        model: topaz.video('proteus'),
        // generateVideo requires a prompt, but Topaz only enhances the input.
        prompt: '',
        inputReferences: [
          'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/prudence.mp4',
        ],
        resolution: '720x1280',
        providerOptions: {
          topaz: {
            // Source metadata opts into Topaz's full flow, which returns a
            // cost estimate before the upload starts.
            source: {
              width: 360,
              height: 640,
              duration: 5.133,
              frameRate: 30,
              frameCount: 154,
            },
            videoType: 'Progressive',
            auto: 'Auto',
            compression: 0.2,
            details: 0.35,
            noise: -0.1,
          } satisfies TopazVideoModelOptions,
        },
      }),
  );

  console.log('Provider metadata:', JSON.stringify(providerMetadata, null, 2));
  await presentVideos(videos);
});
