import { vertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: vertex('gemini-2.5-flash-preview-04-17', { useCodeExecution: true }),
    maxTokens: 10000,
    prompt:
      'Calculate 20th fibonacci number. Then find the nearest palindrome to it.',
  });

  let fullResponse = '';

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta': {
        fullResponse += delta.textDelta;
        process.stdout.write(delta.textDelta);
        break;
      }
    }
  }
  process.stdout.write('\n\n');

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.log);
