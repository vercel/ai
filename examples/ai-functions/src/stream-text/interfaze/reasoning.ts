import { interfaze } from '@ai-sdk/interfaze';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: interfaze('interfaze-beta'),
    prompt: 'What is notable about Sonoran food?',
  });

  for await (const part of result.stream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'finish-step') {
      // Interfaze's reasoning trace and semantic-cache flag are only known
      // once the stream finishes stripping inline `<think>` tags, so they
      // arrive on the step's provider metadata rather than as incremental
      // `reasoning-delta` parts.
      console.log();
      console.log();
      console.log('Reasoning:', part.providerMetadata?.interfaze?.reasoning);
      console.log('Cache hit:', part.providerMetadata?.interfaze?.vcache);
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
