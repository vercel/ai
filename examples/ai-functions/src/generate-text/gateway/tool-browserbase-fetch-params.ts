import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.6-luna',
    prompt:
      'Use Browserbase Fetch to extract the page title, whether a permit is required, and three safety tips from https://www.nps.gov/yose/planyourvisit/halfdome.htm.',
    tools: {
      browserbase_fetch: gateway.tools.browserbaseFetch({
        allowRedirects: true,
        format: 'json',
        schema: {
          type: 'object',
          properties: {
            pageTitle: { type: 'string' },
            permitRequired: { type: 'boolean' },
            safetyTips: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 3,
            },
          },
          required: ['pageTitle', 'permitRequired', 'safetyTips'],
        },
      }),
    },
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
