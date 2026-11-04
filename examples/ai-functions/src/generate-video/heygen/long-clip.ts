import { heygen } from '@ai-sdk/heygen';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Generating a 30-second video with HeyGen...',
    () =>
      generateVideo({
        model: heygen.video('heygen-video-1'),
        prompt:
          'A potter slowly shapes a clay bowl on a wheel in a sunlit studio. One continuous shot with soft workshop sounds.',
        duration: 30,
        aspectRatio: '16:9',
        providerOptions: {
          heygen: { resolution: '768p', promptEnhancement: 'quality' },
        },
      }),
  );
  console.log('HeyGen metadata:', providerMetadata.heygen);
  await presentVideos(videos);
});
