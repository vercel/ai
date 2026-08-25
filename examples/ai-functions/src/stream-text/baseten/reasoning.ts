import { baseten } from '@ai-sdk/baseten';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: baseten('openai/gpt-oss-120b'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
  });

  for await (const part of result.stream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Provider metadata:',
    JSON.stringify((await result.finalStep).providerMetadata, null, 2),
  );
});
