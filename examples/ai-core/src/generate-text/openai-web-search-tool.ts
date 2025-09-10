import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'What happened in tech news today?',
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'medium',
      }),
    },
  });

  console.dir(result.response.body, { depth: Infinity });
  console.dir(result.toolCalls, { depth: Infinity });
  console.dir(result.toolResults, { depth: Infinity });
  console.dir(result.sources, { depth: Infinity });
  console.log(result.text);
});
