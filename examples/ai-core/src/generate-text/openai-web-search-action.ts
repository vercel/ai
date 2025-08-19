import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('o3-2025-04-16'),
    prompt: 'What happened in tech news today?',
    tools: {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: 'medium',
      }),
    },
  });

  for (const toolCall of result.toolCalls) {
    if (toolCall.toolName === 'web_search_preview') {
      console.log('Search query:', toolCall.input);
    }
  }

  console.log(result.text);
}

main().catch(console.error);
