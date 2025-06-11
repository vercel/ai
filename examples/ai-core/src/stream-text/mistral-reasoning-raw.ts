import { mistral } from '@ai-sdk/mistral';
import { extractReasoningMiddleware, streamText, wrapLanguageModel } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: wrapLanguageModel({
      model: mistral('magistral-small-2506'),
      middleware: extractReasoningMiddleware({
        tagName: 'think',
      }),
    }),
    prompt: 'What is 2 + 2?',
  });

  console.log('Mistral reasoning model with extracted reasoning:');
  console.log();

  let enteredReasoning = false;
  let enteredText = false;

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      if (!enteredReasoning) {
        enteredReasoning = true;
        console.log('REASONING:');
      }
      process.stdout.write(part.text);
    } else if (part.type === 'text') {
      if (!enteredText) {
        enteredText = true;
        console.log('\n\nTEXT:');
      }
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log();
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
