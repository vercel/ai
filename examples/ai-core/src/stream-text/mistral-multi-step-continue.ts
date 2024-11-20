import { mistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: mistral('open-mistral-7b'),
    maxTokens: 512, // artificial limit for demo purposes
    maxSteps: 5,
    experimental_continueSteps: true,
    prompt:
      'Write a book about Roman history, ' +
      'from the founding of the city of Rome ' +
      'to the fall of the Western Roman Empire. ' +
      'Each chapter MUST HAVE at least 1000 words.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log('# of steps:', (await result.steps).length);
}

main().catch(console.error);
