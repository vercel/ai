import { gateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
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

  for await (const part of result.stream) {
    switch (part.type) {
      case 'text-delta':
        process.stdout.write(part.text);
        break;
      case 'tool-call':
        console.log('\nTool call:', JSON.stringify(part, null, 2));
        break;
      case 'tool-result':
        console.log('\nTool result:', JSON.stringify(part, null, 2));
        break;
      case 'tool-error':
        console.log('\nTool error:', JSON.stringify(part, null, 2));
        break;
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
