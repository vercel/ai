import { huggingface } from '@ai-sdk/huggingface';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  console.log('Streaming with temperature 0.7:');
  const result = streamText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    prompt: 'Tell me an interesting fact about space exploration.',
    temperature: 0.7,
    maxOutputTokens: 200,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
