import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5.2-codex'),
    tools: {
      write_sql: openai.tools.customTool({
        name: 'write_sql',
        description: 'Write a SQL SELECT query to answer the user question.',
        format: {
          type: 'grammar',
          syntax: 'regex',
          definition: 'SELECT .+',
        },
        execute: async input => {
          console.log(`Executing SQL: ${input}`);
          return `3 rows returned: Alice (30), Bob (28), Charlie (35)`;
        },
      }),
    },
    prompt: 'How many users are older than 25? Use SQL to find out.',
    stopWhen: stepCountIs(3),
  });

  print('Text:', result.text);
  print('Steps:', result.steps.length);
  print('Tool calls:', result.toolCalls);
  print('Tool results:', result.toolResults);
});
