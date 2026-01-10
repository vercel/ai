import { createGateway, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const gateway = createGateway({ baseURL: 'http://localhost:3000/v1/ai' });

  const result = streamText({
    model: gateway('openai/gpt-5-nano'),
    prompt:
      'Use the perplexitySearch tool to find current news about AI regulations in January 2025. You must search the web first before answering.',
    tools: {
      perplexitySearch: gateway.tools.perplexitySearch(),
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else {
      console.log(JSON.stringify(part, null, 2));
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Provider metadata:',
    JSON.stringify(await result.providerMetadata, null, 2),
  );
}

main().catch(console.error);
