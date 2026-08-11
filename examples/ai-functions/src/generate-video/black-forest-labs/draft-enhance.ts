import {
  blackForestLabs,
  type BlackForestLabsVideoModelOptions,
} from '@ai-sdk/black-forest-labs';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

// Draft mode is a two-call flow. `draft: true` renders a fast, lower-quality
// preview and leaves behind an encrypted bundle; sending that bundle back as
// `draftCache` reproduces the same generation at full quality. Both calls are
// separate generations and are billed separately.
const prompt =
  'A white kitten chases a butterfly across a sunlit garden. Gentle camera ' +
  'tracking, natural movement.';

run(async () => {
  const draft = await withSpinner('Rendering a FLUX 3 draft preview...', () =>
    generateVideo({
      model: blackForestLabs.video('flux-3-video'),
      prompt,
      aspectRatio: '16:9',
      duration: 6,
      poll: { timeoutMs: 600_000 }, // 10 minutes
      providerOptions: {
        blackForestLabs: {
          draft: true,
        } satisfies BlackForestLabsVideoModelOptions,
      },
    }),
  );

  console.log('Draft preview:');
  await presentVideos([draft.video]);

  const draftCacheUrl = (
    draft.providerMetadata.blackForestLabs?.videos as
      | Array<{ draftCache?: string }>
      | undefined
  )?.[0]?.draftCache;

  if (draftCacheUrl == null) {
    console.log(
      'No draft bundle was returned, so there is nothing to enhance.',
    );
    return;
  }

  // The bundle is served from a URL that expires. Downloading it and sending
  // the base64 `.bin` is the durable path; passing `draftCacheUrl` straight
  // through also works while the link is still valid.
  const bundleResponse = await fetch(draftCacheUrl);
  const arrayBuffer = await bundleResponse.arrayBuffer();
  const bundle = Buffer.from(arrayBuffer).toString('base64');

  const enhanced = await withSpinner(
    'Enhancing the draft to full quality...',
    () =>
      generateVideo({
        model: blackForestLabs.video('flux-3-video'),
        prompt: '',
        poll: { timeoutMs: 600_000 }, // 10 minutes
        providerOptions: {
          blackForestLabs: {
            draftCache: bundle,
            safetyTolerance: 2,
          } satisfies BlackForestLabsVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', enhanced.warnings);
  console.log('Full-quality render:');
  await presentVideos([enhanced.video]);
});
