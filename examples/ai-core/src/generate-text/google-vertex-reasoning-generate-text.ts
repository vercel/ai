import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
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

  process.stdout.write('\x1b[34m' + result.reasoning + '\x1b[0m');
  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);

  console.log();
  console.log('Warnings:', result.warnings);
}

main().catch(console.log);
