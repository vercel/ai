import { streamText } from 'ai';
import { registry } from './setup-registry';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: registry.languageModel('openai:gpt-4-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
