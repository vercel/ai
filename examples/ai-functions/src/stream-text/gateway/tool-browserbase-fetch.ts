import { gateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'openai/gpt-5.6-luna',
    prompt:
      'Use Browserbase Fetch to read https://www.nps.gov/yose/planyourvisit/halfdome.htm and summarize the permit requirements and main safety warnings.',
    tools: {
      browserbase_fetch: gateway.tools.browserbaseFetch(),
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
