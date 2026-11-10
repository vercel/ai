import { tencent } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos, providerMetadata } = await withSpinner(
    'Generating TokenHub Kling text-to-video with kling-video-v3...',
    () =>
      generateVideo({
        model: tencent.video('kling-video-v3'),
        prompt: 'A chicken flying into the sunset in the style of 90s anime.',
        aspectRatio: '16:9',
        duration: 5,
        providerOptions: { tencent: { pollTimeoutMs: 600000 } },
      }),
  );

  console.log('Provider metadata:', JSON.stringify(providerMetadata, null, 2));
  await presentVideos(videos);
});
