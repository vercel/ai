import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';
import { presentVideos } from '../../lib/present-video';

run(async () => {
  const result = await withSpinner('Generating xAI video...', () =>
    generateVideo({
      model: spacexai.video('grok-imagine-video'),
      prompt: 'A cat sitting on a windowsill watching rain.',
      duration: 5,
      providerOptions: {
        spacexai: {
          pollTimeoutMs: 600000,
        } satisfies SpaceXAIVideoModelOptions,
      },
    }),
  );

  await presentVideos(result.videos);

  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
});
