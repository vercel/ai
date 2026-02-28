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

  const allToolCalls = result.steps.flatMap(step => step.toolCalls);
  const allToolResults = result.steps.flatMap(step => step.toolResults);

  console.log('Text:', result.text);
  console.log('Tool calls (final step):', result.toolCalls);
  console.log('Tool results (final step):', result.toolResults);
  console.log('Tool calls (all steps):', allToolCalls);
  console.log('Tool results (all steps):', allToolResults);
  console.log('Steps:', result.steps.length);
});
