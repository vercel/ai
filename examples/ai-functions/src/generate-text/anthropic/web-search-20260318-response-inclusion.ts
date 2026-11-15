import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-5-5'),
    prompt:
      'In one Python code execution block, search for the current home pages of Vercel and Anthropic, parse each web_search return value with json.loads, then summarize how each describes its main product.',
    tools: {
      web_search: anthropic.tools.webSearch_20260318({
        maxUses: 2,
        responseInclusion: 'excluded',
      }),
    },
  });

  console.log(result.text);
  for (const part of result.content) {
    if (part.type === 'tool-call' || part.type === 'tool-result') {
      console.log(`${part.type}: ${part.toolName}`);
    }
  }
});
