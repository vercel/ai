import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
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

  console.log(result.text);
}

main().catch(console.error);
