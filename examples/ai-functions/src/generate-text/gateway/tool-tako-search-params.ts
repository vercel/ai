import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5-nano',
    prompt:
      'Compare Nvidia and AMD employee counts since 2013 with source-grounded data.',
    tools: {
      tako_search: gateway.tools.takoSearch({
        effort: 'fast',
        sources: {
          data: {
            contentFormat: 'json_compact',
            includeContents: true,
            maxRows: 100,
          },
          web: {
            count: 3,
            includeDomains: ['nvidia.com', 'amd.com'],
          },
        },
        countryCode: 'US',
        locale: 'en-US',
      }),
    },
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Reasoning:', result.reasoning);
  console.log();
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
