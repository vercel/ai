import { tencent, type TencentVideoModelOptions } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Generating Seedance 2.0 video through Tencent VOD...',
    () =>
      generateVideo({
        model: tencent.video('vod/VS/2.0'),
        prompt: 'A drone shot over a misty mountain lake at sunrise.',
        aspectRatio: '16:9',
        resolution: '1280x720',
        duration: 5,
        providerOptions: {
          tencent: {
            inputRegion: 'Oversea',
          } satisfies TencentVideoModelOptions,
        },
        poll: { timeoutMs: 900000 },
      }),
  );

  console.log('Provider metadata:', JSON.stringify(providerMetadata, null, 2));
  await presentVideos(videos);
});
