import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: openai.responses('gpt-5-nano'),
    tools: {
      code_interpreter: openai.tools.codeInterpreter(),
    },
    prompt:
      'Simulate rolling two dice 10000 times and and return the sum all the results.',
    includeRawChunks: true,
  });

  await saveRawChunks({
    result,
    filename: 'openai-code-interpreter-tool',
  });
});
