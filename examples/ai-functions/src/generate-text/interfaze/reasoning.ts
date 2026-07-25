import { interfaze as provider } from '@ai-sdk/interfaze';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: provider.chat('interfaze-beta'),
    prompt: 'What is notable about Sonoran food?',
  });

  // Interfaze surfaces its reasoning trace as a top-level `reasoning` field
  // on the response rather than as a standard reasoning content part, so it
  // lands in `providerMetadata.interfaze.reasoning` instead of `result.reasoning`.
  console.log('Reasoning:');
  console.log(result.providerMetadata?.interfaze?.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Cache hit:', result.providerMetadata?.interfaze?.vcache);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
