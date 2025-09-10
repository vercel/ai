import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      web_fetch: anthropic.tools.webFetch_20250910({
        maxUses: 2,
        blockedDomains: ['blocked-site.com'],
        citations: { enabled: false },
        maxContentTokens: 3000,
      }),
    },
    prompt:
      'If I provide you with a URL, fetch its content and give me a brief summary. Here is the URL: https://example.com',
  });

  // Stream the response
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  // Wait for full response to get tool results
  const toolResults = await result.toolResults;

  // Display tool results after streaming completes
  if (toolResults && toolResults.length > 0) {
    console.log('\n\n--- Web Fetch Results ---');
    for (const toolResult of toolResults) {
      if (toolResult.toolName === 'web_fetch' && toolResult.providerExecuted) {
        const output = toolResult.output as any;
        if (output && output.url) {
          console.log(`✓ Successfully fetched: ${output.url}`);
          console.log(`  Title: ${output.title || 'N/A'}`);
          console.log(
            `  Content length: ${output.content?.length || 0} characters`,
          );
        } else if (output && output.errorCode) {
          console.log(`✗ Failed to fetch: Error code ${output.errorCode}`);
        }
      }
    }
  }
}

main().catch(console.error);
