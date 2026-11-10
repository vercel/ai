import { tencent, type TencentVideoModelOptions } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  // Multi-shot prompt syntax: `shot <n>, <seconds>, <prompt>;` per shot. The
  // shot durations must add up to the video duration.
  const { videos } = await withSpinner(
    'Generating TokenHub Kling multi-shot video with kling-video-v3...',
    () =>
      generateVideo({
        model: tencent.video('kling-video-v3'),
        prompt:
          'shot 1, 3, a wide shot of a lighthouse on a rocky cliff at dawn; ' +
          'shot 2, 3, a close-up of the lighthouse lamp turning, glowing warm yellow;',
        aspectRatio: '16:9',
        duration: 6,
        resolution: '1280x720',
        providerOptions: {
          tencent: { multiShot: true } satisfies TencentVideoModelOptions,
        },
        poll: { timeoutMs: 600000 },
      }),
  );

  await presentVideos(videos);
});
