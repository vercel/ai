import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    prompt:
      'What are current stock market trends? Search for latest financial news.',
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 2,
        blockedDomains: ['reddit.com'],
      }),
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Sources:', (await result.sources).length);
  console.log('Usage:', await result.usage);
  console.log();
}

main().catch(console.error);
