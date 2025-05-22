import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

async function main() {
  const { content } = await generateText({
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

  for (const part of content) {
    if (part.type === 'text') {
      process.stdout.write(part.text);
    } else if (part.type === 'reasoning') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    }
  }
}

main().catch(console.log);
