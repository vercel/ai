import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import { run } from '../../lib/run';
import { saveRawChunks } from '../../lib/save-raw-chunks';

run(async () => {
  const result = await streamText({
    model: azure('gpt-5.4-mini'),
    prompt: 'Please summarize about vercel/ai.',
    tools: {
      mcp: azure.tools.mcp({
        serverLabel: 'dmcp',
        serverUrl: 'https://mcp.deepwiki.com/mcp',
        serverDescription: 'A depepwiki MCP',
      }),
    },
    includeRawChunks: true,
  });

  console.log('\n=== Basic Text Generation ===');
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log('\nTOOL CALLS:\n');
  console.log(await result.toolCalls);
  console.log('\nTOOL RESULTS:\n');
  console.log(await result.toolResults);
});
