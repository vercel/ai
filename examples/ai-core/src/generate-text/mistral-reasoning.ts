import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: mistral('magistral-small-2507'),
    prompt: 'What is 2 + 2?',
  });

  console.log('Reasoning content:');
  if (result.reasoningText) {
    console.log('🤔', result.reasoningText);
    console.log();
  }

  console.log('Final answer:');
  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
