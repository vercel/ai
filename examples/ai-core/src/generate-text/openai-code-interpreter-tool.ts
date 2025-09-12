import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-nano'),
    tools: {
      code_interpreter: openai.tools.codeInterpreter(),
    },
    prompt:
      'Simulate rolling two dice 10000 times and and return the sum all the results.',
  });

  console.dir(result.content, { depth: Infinity });
});
