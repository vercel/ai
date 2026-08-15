import { deepSeek } from '@ai-sdk/deepseek';
import { generateText, isStepCount } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    // web search is only available on the Responses API:
    model: deepSeek.responses('deepseek-v4-flash'),
    tools: { web_search: deepSeek.tools.webSearch() },
    stopWhen: isStepCount(5),
    prompt: 'Who won the 2026 FIFA World Cup? Answer in one sentence.',
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
});
