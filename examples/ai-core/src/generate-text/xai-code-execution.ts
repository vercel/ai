import 'dotenv/config';
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4'),
    prompt:
      'Calculate the compound interest for $10,000 at 5% annually for 10 years',
    // 'What is the latest in US news?',
    tools: {
      web_search: xai.tools.webSearch(),
      code_execution: xai.tools.codeExecution(),
    },
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Tool calls made:');
  for (const content of result.content) {
    if (content.type === 'tool-call') {
      console.log(
        `  - ${content.toolName} (${content.providerExecuted ? 'server-side' : 'client-side'})`,
      );
    }
  }
});
