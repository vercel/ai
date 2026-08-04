import {
  blackForestLabs,
  type BlackForestLabsVideoModelOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Text-to-video with synchronized audio.
run(async () => {
  const { video, warnings, providerMetadata } = await withSpinner(
    'Generating FLUX 3 video from a prompt...',
    () =>
      generateVideo({
        model: blackForestLabs.video('flux-3-video'),
        prompt:
          'A white kitten chases a butterfly across a sunlit garden. Gentle ' +
          'camera tracking, natural movement, birdsong and rustling leaves.',
        aspectRatio: '16:9',
        duration: 8,
        generateAudio: true,
        poll: { timeoutMs: 600_000 }, // 10 minutes
        providerOptions: {
          blackForestLabs: {
            // The API takes a named tier rather than pixel dimensions. The
            // top-level `resolution` also works — '1920x1080' maps to 'fhd' —
            // but only the provider option can say it directly.
            resolution: 'fhd',
          } satisfies BlackForestLabsVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);
  // Carries the request id plus the credit cost and input/output megapixels
  // Black Forest Labs reported for the job.
  console.log('Provider metadata:', providerMetadata);
  await presentVideos([video]);
});
