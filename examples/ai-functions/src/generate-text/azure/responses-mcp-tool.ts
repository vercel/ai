import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.4-mini'),
    prompt: 'Please summarize about vercel/ai.',
    tools: {
      mcp: azure.tools.mcp({
        serverLabel: 'dmcp',
        serverUrl: 'https://mcp.deepwiki.com/mcp',
        serverDescription: 'A depepwiki MCP',
      }),
    },
  });

  console.log('\nTOOL CALLS:\n');
  console.dir(result.toolCalls, { depth: Infinity });
  console.log('\nTOOL RESULTS:\n');
  console.dir(result.toolResults, { depth: Infinity });
  console.log('\nTEXT RESULT:\n');
  console.log(result.text);
});
