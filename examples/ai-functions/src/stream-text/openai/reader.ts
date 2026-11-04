import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-4.1'),
    maxOutputTokens: 512,
    temperature: 0.3,
    maxRetries: 5,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  const reader = result.textStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    process.stdout.write(value);
  }
});
