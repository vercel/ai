import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating xAI reference-to-video with reference audio...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video-1.5'),
        prompt:
          'Handheld UGC-style product review. The creator from <IMAGE_0> holds ' +
          'the skincare jar from <IMAGE_1>, looks at the camera, and talks about ' +
          'the product in the voice from <AUDIO_0>. Casual phone-camera framing.',
        duration: 10,
        aspectRatio: '9:16',
        providerOptions: {
          xai: {
            mode: 'reference-to-video',
            resolution: '720p',
            referenceImageUrls: [
              'https://docs.x.ai/assets/api-examples/images/image-merge/woman.jpg',
              'https://x.ai/images/imagine-demo/nav/nav-5-night.jpg',
            ],
            referenceAudioUrls: [
              'https://data.x.ai/audio-samples/voice_ara.mp3',
            ],
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
