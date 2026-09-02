import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5.6-luna',
    prompt:
      'Use Browserbase Search to find three recent reviews comparing e-readers for outdoor reading. Return their titles and URLs.',
    tools: {
      browserbase_search: gateway.tools.browserbaseSearch({
        numResults: 3,
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
