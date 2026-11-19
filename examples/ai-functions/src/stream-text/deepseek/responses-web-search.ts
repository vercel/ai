import { deepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: deepSeek.responses('deepseek-v4-pro'),
    prompt: 'What happened in AI news this week? Cite your sources.',
    tools: {
      web_search: deepSeek.tools.webSearch(),
    },
  });

  printFullStream({ result });
});
