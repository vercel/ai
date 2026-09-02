import { topaz, type TopazVideoModelOptions } from '@ai-sdk/topaz';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Enhancing video with Proteus...', () =>
    generateVideo({
      model: topaz.video('proteus'),
      inputReferences: [
        'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/prudence.mp4',
      ],
      // `resolution`, `duration` and `fps` fill in the corresponding source
      // fields, so only `frameCount` is left to declare.
      resolution: '1920x1080',
      duration: 10,
      fps: 30,
      providerOptions: {
        topaz: {
          source: { frameCount: 300 },
          videoType: 'Progressive',
          auto: 'Auto',
          compression: 0.2,
          details: 0.35,
          noise: -0.1,
        } satisfies TopazVideoModelOptions,
      },
    }),
  );

  await presentVideos(videos);
});
