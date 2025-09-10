import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 3,
        allowedDomains: ['docs.anthropic.com', 'github.com'],
      }),
      web_fetch: anthropic.tools.webFetch_20250910({
        maxUses: 5,
        allowedDomains: ['docs.anthropic.com', 'github.com'],
        citations: { enabled: true },
        maxContentTokens: 10000,
      }),
    },
    prompt:
      'Search for information about the Anthropic Claude API tool use feature, then fetch and analyze the most relevant documentation page.',
  });

  console.log('Response:', result.text);

  // Display tool usage details
  if (result.toolCalls && result.toolCalls.length > 0) {
    console.log('\n--- Tool Usage ---');
    for (const call of result.toolCalls) {
      console.log(`Tool: ${call.toolName}`);
      console.log(`Arguments:`, JSON.stringify(call.input, null, 2));
    }
  }

  // Display tool results
  if (result.toolResults && result.toolResults.length > 0) {
    console.log('\n--- Tool Results ---');
    for (const toolResult of result.toolResults) {
      if (toolResult.providerExecuted) {
        console.log(`Tool: ${toolResult.toolName}`);
        if (toolResult.toolName === 'web_search') {
          const searchResults = toolResult.output as any;
          console.log('Search Results:');
          searchResults.forEach((item: any, index: number) => {
            console.log(`  ${index + 1}. ${item.title} (${item.url})`);
          });
        } else if (toolResult.toolName === 'web_fetch') {
          const fetchResult = toolResult.output as any;
          console.log(`Fetched URL: ${fetchResult.url}`);
          console.log(`Title: ${fetchResult.title || 'N/A'}`);
          if (fetchResult.citations && fetchResult.citations.length > 0) {
            console.log('Citations:', fetchResult.citations.length, 'found');
          }
        }
      }
    }
  }
}

main().catch(console.error);
