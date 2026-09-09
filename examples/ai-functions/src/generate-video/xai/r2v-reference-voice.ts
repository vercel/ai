import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video, warnings } = await withSpinner(
    'Generating xAI reference-to-video with a preset reference voice...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video-1.5'),
        prompt:
          'The comic cat from <IMAGE_0> sits beside the comic dog from ' +
          '<IMAGE_1>. The cat speaks with the voice from <AUDIO_0> and the dog talks to the camera with the voice from <AUDIO_1>. ' +
          'Handheld vertical shot, warm afternoon light.',
        aspectRatio: '9:16',
        duration: 10,
        providerOptions: {
          xai: {
            mode: 'reference-to-video',
            referenceImageUrls: [
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-dog.png',
            ],
            referenceVoiceIds: ['luna', 'zagan'],
            resolution: '720p',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);

  await presentVideos([video]);
});
