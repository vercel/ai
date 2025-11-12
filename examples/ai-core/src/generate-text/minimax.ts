import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: minimax('MiniMax-M2'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);

