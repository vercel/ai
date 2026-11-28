import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.6-luna',
    prompt:
      'Use Expand Fetch with Highlights to find the permit requirements on https://www.nps.gov/yose/planyourvisit/halfdome.htm and list them with the page title.',
    tools: {
      expand_fetch: gateway.tools.expandFetch({
        includeAppendix: true,
        scrollFullPage: true,
        highlights: {
          maxResults: 3,
          minScore: 0.5,
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
