import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.6-luna',
    prompt:
      'Use Browserbase Fetch to read https://www.nps.gov/yose/planyourvisit/halfdome.htm and summarize the permit requirements and main safety warnings.',
    tools: {
      browserbase_fetch: gateway.tools.browserbaseFetch(),
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
