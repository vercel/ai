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
    if (part.type === 'reasoning') {
<<<<<<< HEAD
      process.stdout.write('\x1b[34m' + part.textDelta + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.textDelta);
=======
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text') {
      process.stdout.write(part.text);
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.log);
