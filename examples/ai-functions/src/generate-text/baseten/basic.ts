import { baseten } from '@ai-sdk/baseten';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Using default Model APIs - works with hosted models on Baseten
  const result = await generateText({
    model: baseten('zai-org/GLM-5.2'),
    prompt: 'What is the meaning of life? Answer in one sentence.',
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
  console.log(
    'Provider metadata:',
    JSON.stringify(result.finalStep.providerMetadata, null, 2),
  );
});
