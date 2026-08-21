import { spacexai } from '@ai-sdk/spacexai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: spacexai.responses('grok-4-fast-non-reasoning'),
    prompt: 'What is the capital of France?',
  });

  console.log('Response:', result.text);
  console.log();
  console.log(
    'Provider metadata:',
    JSON.stringify(result.finalStep.providerMetadata, null, 2),
  );
});
