import { gateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const model = process.env.DEEPSEEK_TOOLS_MODEL;
  if (!model)
    throw new Error('Set DEEPSEEK_TOOLS_MODEL to a tool-calling model ID.');
  const result = streamText({
    model,
    prompt:
      'Search for DeepSeek API documentation, fetch one relevant page, and summarize it.',
    tools: {
      search: gateway.tools.deepseekSearch({ count: 3, needContent: true }),
      fetch: gateway.tools.deepseekFetch(),
    },
  });
  for await (const part of result.stream) {
    if (part.type === 'text-delta') process.stdout.write(part.text);
    if (part.type === 'tool-result') console.log('Tool result:', part.output);
  }
  console.log();
}

main().catch(console.error);
