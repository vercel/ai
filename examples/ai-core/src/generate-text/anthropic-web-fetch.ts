import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      web_fetch: anthropic.tools.webFetch_20250910({
        maxUses: 3,
        allowedDomains: ['example.com', 'docs.anthropic.com'],
        citations: { enabled: true },
        maxContentTokens: 5000,
      }),
    },
    prompt:
      'Fetch the content from https://docs.anthropic.com/en/docs/agents-and-tools/tool-use and summarize the key points about tool use.',
  });

  console.log(result.text);

  // Display fetched content if available
  if (result.toolResults && result.toolResults.length > 0) {
    console.log('\n--- Fetched Content ---');
    for (const toolResult of result.toolResults) {
      if (toolResult.toolName === 'web_fetch' && toolResult.providerExecuted) {
        const fetchResult = toolResult.output as any;
        console.log(`URL: ${fetchResult.url}`);
        console.log(`Title: ${fetchResult.title || 'N/A'}`);
        console.log(`Description: ${fetchResult.description || 'N/A'}`);
        if (fetchResult.citations && fetchResult.citations.length > 0) {
          console.log('Citations:');
          fetchResult.citations.forEach((citation: any, index: number) => {
            console.log(`  ${index + 1}. ${citation.text} (${citation.source})`);
          });
        }
      }
    }
  }
}

main().catch(console.error);