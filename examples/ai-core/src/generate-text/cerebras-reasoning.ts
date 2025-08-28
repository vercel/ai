import 'dotenv/config';
import { cerebras as provider } from '@ai-sdk/cerebras';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: provider.chat('gpt-oss-120b'),
    prompt: 'What is notable about Sonoran food?',
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
