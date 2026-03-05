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
    toolChoice: { type: 'tool', toolName: 'alias_name' },
    prompt: 'write sql select 1',
    stopWhen: stepCountIs(2),
  });

  const stepOneRequestBody = result.steps[0]?.request?.body as
    | { tool_choice?: unknown }
    | undefined;

  console.log('Step 1 tool_choice:', stepOneRequestBody?.tool_choice);
  console.log('Tool calls:', result.toolCalls);
  console.log('Tool results:', result.toolResults);
  console.log('Steps:', result.steps.length);
});
