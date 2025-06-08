import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {

  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-latest'),
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        max_uses: 5,
        user_location: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'California',
          country: 'US',
          timezone: 'America/Los_Angeles',
        },
        // Optional: restrict to specific domains
        // allowed_domains: ['wikipedia.org', 'docs.anthropic.com'],
        // Optional: block certain domains
        // blocked_domains: ['example.com'],
      }),
    },
    prompt: 'What is the best burrito near the Vercel office in San Francisco?',
  });


  console.log(result.toolCalls);

  console.log(result.toolResults);

  console.log(result.text);

}

main().catch(console.error);
