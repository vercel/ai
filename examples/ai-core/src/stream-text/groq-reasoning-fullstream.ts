import { groq } from '@ai-sdk/groq';
import {
  experimental_wrapLanguageModel,
  extractReasoningMiddleware,
  streamText,
} from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: experimental_wrapLanguageModel({
      model: groq('deepseek-r1-distill-llama-70b'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  let enteredReasoning = false;
  let enteredText = false;
  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      if (!enteredReasoning) {
        enteredReasoning = true;
        console.log('\nSTREAMING REASONING:\n');
      }
      process.stdout.write(part.textDelta);
    } else if (part.type === 'text-delta') {
      if (!enteredText) {
        enteredText = true;
        console.log('\nSTREAMING TEXT:\n');
      }
      process.stdout.write(part.textDelta);
    }
  }

  console.log();
  console.log('\nFINAL REASONING:\n', await result.reasoning);
  console.log('\nFINAL TEXT:\n', await result.text);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
