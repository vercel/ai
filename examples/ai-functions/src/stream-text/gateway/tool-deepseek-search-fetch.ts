import { gateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'openai/gpt-6-luna',
    prompt:
      'Search for DeepSeek API documentation, fetch one relevant page, and summarize it.',
    tools: {
      search: gateway.tools.deepseekSearch({ count: 3, needContent: true }),
      fetch: gateway.tools.deepseekFetch(),
    },
  });
  for await (const part of result.stream) {
    if (part.type === 'text-delta') process.stdout.write(part.text);
    if (part.type === 'tool-call') console.log('Tool call:', part);
    if (part.type === 'tool-error') console.error('Tool error:', part.error);
    if (part.type === 'tool-result') console.log('Tool result:', part.output);
  }
  console.log();
}

main().catch(console.error);
