import { heygen } from '@ai-sdk/heygen';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Generating video with HeyGen...',
    () =>
      generateVideo({
        model: heygen.video('heygen-video-1'),
        prompt:
          'A paper boat floats down a quiet stream. Static camera, soft morning light, the sound of flowing water. No music.',
        duration: 5,
        aspectRatio: '16:9',
      }),
  );
  console.log('HeyGen metadata:', providerMetadata.heygen);
  await presentVideos(videos);
});
