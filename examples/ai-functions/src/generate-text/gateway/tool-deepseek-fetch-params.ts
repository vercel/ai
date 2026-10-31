import { gateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'openai/gpt-6-luna',
    prompt: 'Fetch https://example.com and summarize its page content.',
    tools: {
      deepseek_fetch: gateway.tools.deepseekFetch({
        url: 'https://example.com',
      }),
    },
  });

  console.log('Text:', result.text);
  console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
  for (const part of result.content) {
    if (part.type === 'tool-error') console.error('Tool error:', part.error);
  }
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
