import { moonshot } from '@ai-sdk/moonshot';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: moonshot('kimi-k2-0711-preview'),
    prompt: "How many r's is there in strawberry?",
    temperature: 0.6, // Recommended temperature for Kimi K2
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
