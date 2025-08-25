import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'What happened in San Francisco last week?',
    tools: {
      web_search_preview: openai.tools.webSearchPreview({}),
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:');
  console.log(result.sources);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);

  console.log('Request:', JSON.stringify(result.request, null, 2));
  console.log('Response:', JSON.stringify(result.response, null, 2));
}

main().catch(console.error);
