import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-haiku-4-5'),
    prompt:
      'Summarize this pdf.\n' +
      'https://assets.unilogcorp.com/187/ITEM/DOC/Simpson_Strong_Tie_101860392_Specification_Sheet.pdf',
    tools: {
      web_fetch: anthropic.tools.webFetch_20250910(),
    },
  });

  console.dir(result.response.body, { depth: Infinity });
  console.dir(result.content, { depth: Infinity });
});
