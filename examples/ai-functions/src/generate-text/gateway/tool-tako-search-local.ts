import { createGateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import 'dotenv/config';

const gateway = createGateway({
  baseURL: 'http://localhost:3000/v4/ai',
});

async function main() {
  const result = await generateText({
    model: gateway('openai/gpt-5-nano'),
    prompt:
      'Use the tako_search tool to find the current spot price of silver in USD. You must call the tool before answering.',
    tools: {
      tako_search: gateway.tools.takoSearch({
        effort: 'fast',
        sources: {
          data: { count: 1, includeContents: true },
          web: { count: 1 },
        },
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
