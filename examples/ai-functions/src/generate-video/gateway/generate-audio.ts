import { gateway, experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating video with audio via AI Gateway...',
    () =>
      generateVideo({
        model: gateway.videoModel('google/veo-3.1-generate-001'),
        prompt: 'A resplendent quetzal flying through the rainforest.',
        aspectRatio: '16:9',
        duration: 4,
        generateAudio: true,
      }),
  );

  await presentVideos(videos);
});
