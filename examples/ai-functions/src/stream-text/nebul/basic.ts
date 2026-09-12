import { nebul } from '@ai-sdk/nebul';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: nebul('mistralai/Mistral-7B-Instruct-v0.3'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
