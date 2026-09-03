import { alibaba, type AlibabaVideoModelOptions } from '@ai-sdk/alibaba';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// wan3 has no -r2v id. inputReferences become input.media reference_image /
// reference_video items, referenced in the prompt as Image 1, Image 2, etc.
run(async () => {
  const { video } = await withSpinner(
    'Generating reference-to-video with wan3.0-video...',
    () =>
      generateVideo({
        model: alibaba.video('wan3.0-video'),
        prompt: 'Image 1 and Image 2 have a conversation in a cozy cafe',
        resolution: '1920x1080',
        duration: 6,
        inputReferences: [
          'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
          'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-dog.png',
        ],
        providerOptions: {
          alibaba: {
            ratio: '16:9',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies AlibabaVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
