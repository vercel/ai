import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: deepseek('deepseek-chat'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxOutputTokens: 300,
  });

  console.log(JSON.stringify(result.response.body, null, 2));
});
