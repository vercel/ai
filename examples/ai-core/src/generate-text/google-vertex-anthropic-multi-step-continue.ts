import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';

async function main() {
  const { text, usage, steps } = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
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
