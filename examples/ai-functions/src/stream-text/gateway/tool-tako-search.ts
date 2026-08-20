import { gateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'openai/gpt-5-nano',
    prompt:
      'Compare Nvidia and AMD employee counts since 2013 with source-grounded data.',
    tools: {
      tako_search: gateway.tools.takoSearch(),
    },
  });

  for await (const part of result.stream) {
    switch (part.type) {
      case 'reasoning-delta':
        process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
        break;
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
}

main().catch(console.error);
