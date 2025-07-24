import { mistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: mistral('mistral-small-latest'),
    prompt: 'Count from 1 to 3 slowly.',
    includeRawChunks: true,
  });

  let textChunkCount = 0;
  let rawChunkCount = 0;

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      textChunkCount++;
      console.log('Text chunk', textChunkCount, ':', chunk.text);
    } else if (chunk.type === 'raw') {
      rawChunkCount++;
      console.log(
        'Raw chunk',
        rawChunkCount,
        ':',
        JSON.stringify(chunk.rawValue),
      );
    }
  }

  console.log();
  console.log('Text chunks:', textChunkCount);
  console.log('Raw chunks:', rawChunkCount);
  console.log('Final text:', await result.text);
}

main().catch(console.error);
