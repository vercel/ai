import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'Can you search the web for latest NYC mayoral election results?',
    tools: {
      mcp: openai.tools.mcp({
        serverLabel: 'dmcp',
        serverUrl: 'https://mcp.exa.ai/mcp',
        serverDescription: 'A web-search API for AI agents',
      }),
    },
  });

  console.dir(result.response.body, { depth: Infinity });
  console.dir(result.toolCalls, { depth: Infinity });
  console.dir(result.toolResults, { depth: Infinity });
  console.log(result.text);
});
