import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    prompt: 'Write a short story and end it with the word END.',
    stopSequences: ['END'],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Stop sequence:',
    (await result.providerMetadata)?.anthropic?.stopSequence,
  );
}

main().catch(console.error);
