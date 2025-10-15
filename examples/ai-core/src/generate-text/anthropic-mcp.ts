import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt: `Call the echo tool with "hello world". what does it respond with back?`,
    providerOptions: {
      anthropic: {
        mcpServers: [
          {
            type: 'url',
            name: 'echo',
            url: 'https://echo.mcp.inevitable.fyi/mcp',
          },
        ],
      },
    },
  });

  console.log(JSON.stringify(result.request.body, null, 2));
  console.dir(result.content, { depth: Infinity });
});
