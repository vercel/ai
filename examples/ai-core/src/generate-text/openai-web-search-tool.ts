import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5'),
    prompt: 'What happened in tech news today?',
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'medium',
      }),
    },
  });

  for (const toolCall of result.toolCalls) {
    if (toolCall.toolName === 'web_search') {
      console.log('Search query:', toolCall.input);
    }
  }

  console.dir(result.response.body);
  console.dir(result.toolCalls);
  console.dir(result.toolResults);
  console.dir(result.sources);
  console.log(result.text);
});
