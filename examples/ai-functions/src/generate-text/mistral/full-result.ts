import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: mistral('mistral-small-latest'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(JSON.stringify(result, null, 2));
});
