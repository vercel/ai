import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: vertex('gemini-2.5-flash-preview-04-17'),
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 1024,
          includeThoughts: true
        },
      },
    },
    maxOutputTokens: 2048,
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  process.stdout.write('\x1b[34m' + result.reasoningText + '\x1b[0m');
  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
