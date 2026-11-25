import { gateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'openai/gpt-6-luna',
    prompt:
      'Search the web for DeepSeek API documentation and summarize the results.',
    tools: {
      deepseek_search: gateway.tools.deepseekSearch({
        query: 'DeepSeek API documentation site:api-docs.deepseek.com',
        count: 3,
        needContent: true,
        oriQuestion: 'How do DeepSeek Search and Fetch work?',
      }),
    },
  });

  for await (const part of result.stream) {
    if (part.type === 'text-delta') process.stdout.write(part.text);
    if (part.type === 'tool-call') console.log('Tool call:', part);
    if (part.type === 'tool-result') console.log('Tool result:', part.output);
    if (part.type === 'tool-error') console.error('Tool error:', part.error);
  }
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
