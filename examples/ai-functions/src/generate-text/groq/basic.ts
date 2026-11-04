import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: groq('llama-3.1-8b-instant'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
