import { siftq, type SiftQVideoModelOptions } from '@ai-sdk/siftq';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Generating video...',
    () =>
      generateVideo({
        model: siftq.video(),
        prompt:
          'A tiny paper boat crossing a moonlit ocean, cinematic lighting, gentle waves',
        aspectRatio: '16:9',
        duration: 6,
        providerOptions: {
          siftq: {
            resolution: '768P',
          } satisfies SiftQVideoModelOptions,
        },
        poll: {
          intervalMs: 5000,
          timeoutMs: 900000,
        },
      }),
  );

  console.log('Task ID:', providerMetadata?.siftq?.taskId);
  await presentVideos(videos);
});
