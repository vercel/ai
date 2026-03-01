import { azure } from '@ai-sdk/azure';
import { stepCountIs, streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'tool-call': {
        console.log(
          `\x1b[32m\x1b[1mTool call:\x1b[22m ${chunk.toolName}\x1b[0m`,
        );
        console.log(`  Input: ${JSON.stringify(chunk.input)}`);
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
});
