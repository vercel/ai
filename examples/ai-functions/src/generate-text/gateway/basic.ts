import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage } = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
});
