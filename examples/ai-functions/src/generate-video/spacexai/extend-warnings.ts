import { spacexai, type SpaceXAIVideoModelOptions } from '@ai-sdk/spacexai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';

// Demonstrates that aspectRatio and resolution are silently ignored
// (with a warning) when using extension mode.
run(async () => {
  console.log('Step 1: generating a source video...');
  const source = await generateVideo({
    model: spacexai.video('grok-imagine-video'),
    prompt: 'A cat sitting on a windowsill.',
    duration: 3,
    providerOptions: {
      spacexai: { pollTimeoutMs: 600000 } satisfies SpaceXAIVideoModelOptions,
    },
  });

  const sourceUrl = source.providerMetadata?.spacexai?.videoUrl as
    | string
    | undefined;
  if (sourceUrl == null) {
    throw new Error('xAI provider metadata did not include a source videoUrl.');
  }

  console.log('Source video URL:', sourceUrl);

  console.log('\nStep 2: extending with unsupported params...');
  const result = await generateVideo({
    model: spacexai.video('grok-imagine-video'),
    prompt: 'The cat stretches and jumps off the windowsill.',
    duration: 5,
    aspectRatio: '16:9',
    resolution: '1280x720',
    providerOptions: {
      spacexai: {
        mode: 'extend-video',
        videoUrl: sourceUrl,
        pollTimeoutMs: 600000,
      } satisfies SpaceXAIVideoModelOptions,
    },
  });

  console.log('\nWarnings (aspectRatio and resolution are unsupported):');
  console.log(JSON.stringify(result.warnings, null, 2));
});
