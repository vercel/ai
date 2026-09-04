import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-5-nano',
    prompt:
      "How has ChatGPT's web traffic trended this year, and what do analysts say about it?",
    tools: {
      tako_search: gateway.tools.takoSearch(),
    },
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
}

main().catch(console.error);
