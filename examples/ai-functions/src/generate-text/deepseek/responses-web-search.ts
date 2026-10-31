import { deepSeek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: deepSeek.responses('deepseek-v4-pro'),
    prompt: 'What happened in AI news this week? Cite your sources.',
    tools: {
      web_search: deepSeek.tools.webSearch(),
    },
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
  print('Provider metadata:', result.providerMetadata);
});
