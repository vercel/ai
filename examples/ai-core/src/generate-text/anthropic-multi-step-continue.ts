import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage, steps } = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    maxTokens: 512, // artificial limit for demo purposes
    maxSteps: 5,
    experimental_continueSteps: true,
    prompt:
      'Write a book about Roman history, ' +
      'from the founding of the city of Rome ' +
      'to the fall of the Western Roman Empire. ' +
      'Each chapter MUST HAVE at least 1000 words.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
  console.log('# of steps:', steps.length);
}

main().catch(console.error);
