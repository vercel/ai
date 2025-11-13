import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { generateText, stepCountIs } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'What are the latest developments in AI today?',
    tools: {
      search: perplexity.tools.search(),
    },
    stopWhen: stepCountIs(3),
  });

  console.log(result.text);
  console.log('\nUsage:', result.usage);
}

main().catch(console.error);
