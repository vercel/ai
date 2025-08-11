import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-4.1-nano'),
    maxOutputTokens: 1024,
    messages: [{ role: 'user', content: 'Output Y or N.' }],
    providerOptions: {
      openai: {
        logprobs: 5,
      },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.dir(await result.providerMetadata, { depth: null });
}

main().catch(console.error);
