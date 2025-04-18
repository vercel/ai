import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash-preview-04-17'),
    prompt: 'Tell me the history of the San Francisco Mission-style burrito.',
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 1024,
        },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      process.stdout.write('\x1b[34m' + part.textDelta + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.textDelta);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
