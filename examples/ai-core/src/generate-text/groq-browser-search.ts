import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: groq('openai/gpt-oss-120b'),
    prompt:
      'What are the latest developments in AI? Please search for recent news.',
    tools: {
      browser_search: groq.tools.browserSearch({}),
    },
    toolChoice: 'required',
  });

  console.log(result.text);
  console.log('\nUsage:', result.usage);
}

main().catch(console.error);
