import { deepseek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onChunk({ chunk }) {
      if (chunk.type === 'reasoning') {
        console.log('reasoning', chunk.textDelta);
      }
    },
  });

  // consume stream:
  for await (const part of result.fullStream) {
  }

  console.log('reasoning', await result.reasoning);
}

main().catch(console.error);
