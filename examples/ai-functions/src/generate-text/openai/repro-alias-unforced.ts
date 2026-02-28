import { generateText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5.2-codex'),
    tools: {
      alias_name: openai.tools.customTool({
        name: 'write_sql',
        format: { type: 'grammar', syntax: 'regex', definition: 'SELECT .+' },
        execute: async input => 'ok:' + input,
      }),
    },
    prompt: 'write sql select users older than 25',
    stopWhen: stepCountIs(5),
  });

  console.log('Text:', result.text);
  console.log('Tool calls:', result.toolCalls);
  console.log('Tool results:', result.toolResults);
  console.log('Steps:', result.steps.length);
});
