import { anthropic } from '@ai-sdk/anthropic';
import 'dotenv/config';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-7-sonnet-20250219'),
    prompt: "How many analytics events are included on Vercel's free plan?",
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        max_uses: 2,
        allowed_domains: ['vercel.com'],
      }),
    },
  });

  console.log(result);
}

main().catch(console.error);
