import { vertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: vertex('gemini-2.5-flash-preview-04-17'),
    prompt:
      "Describe the most unusual or striking architectural feature you've ever seen in a building or structure.",
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 2048,
          includeThoughts: true,
        },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.log);
