import { azure } from '@ai-sdk/azure';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.3-codex'),
    tools: {
      write_sql: azure.tools.customTool({
        name: 'write_sql',
        description: 'Write a SQL SELECT query to answer the user question.',
        format: {
          type: 'grammar',
          syntax: 'regex',
          definition: 'SELECT .+',
        },
      }),
    },
    toolChoice: 'required',
    prompt: 'Write a SQL query to get all users older than 25.',
    stopWhen: stepCountIs(5),
  });

  print('Tool calls:', result.toolCalls);
  print('Finish reason:', result.finishReason);
  print('Usage:', result.usage);
});
