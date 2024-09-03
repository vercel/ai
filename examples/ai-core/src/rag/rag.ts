import { streamText } from 'ai';
import dotenv from 'dotenv';
import { yourRagModel } from './your-rag-model';

dotenv.config();

async function main() {
  const result = await streamText({
    model: yourRagModel({ maxChunks: 3 }),
    maxTokens: 512,
    temperature: 0.3,
    maxRetries: 5,
    prompt: 'What cities are in the United States?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
