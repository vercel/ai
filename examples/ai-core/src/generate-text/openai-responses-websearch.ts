import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'What happened in San Francisco last week?',
    tools: {
      web_search_preview: openai.tools.webSearchPreview(),
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:');
  console.log(result.sources);
  console.log('Citations:');
  console.log(result.citations);
}

main().catch(console.error);
