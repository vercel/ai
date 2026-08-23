import { deepSeek } from '@ai-sdk/deepseek';
import { isStepCount, streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    // web search is only available on the Responses API:
    model: deepSeek.responses('deepseek-v4-flash'),
    tools: { web_search: deepSeek.tools.webSearch() },
    stopWhen: isStepCount(5),
    prompt: 'Who won the 2026 FIFA World Cup? Answer in one sentence.',
  });

  printFullStream({ result });
});
