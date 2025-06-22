import { groq } from '@ai-sdk/groq';
import 'dotenv/config';

async function main() {
  const model = groq('llama-3.3-70b-versatile');

  console.log('=== GROQ RAW STREAMING CHUNKS ===');

  const { stream } = await model.doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Count from 1 to 3 slowly.' }],
      },
    ],
    includeRawChunks: true,
  });

  let textChunkCount = 0;
  let rawChunkCount = 0;
  let fullText = '';

  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      if (chunk.type === 'raw') {
        rawChunkCount++;
        console.log(
          'Raw chunk',
          rawChunkCount,
          ':',
          JSON.stringify(chunk.rawValue),
        );
      } else {
        console.log('Processed chunk:', chunk.type, JSON.stringify(chunk));
      }

      if (chunk.type === 'text-delta') {
        textChunkCount++;
        fullText += chunk.delta;
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log();
  console.log('Text chunks:', textChunkCount);
  console.log('Raw chunks:', rawChunkCount);
  console.log('Final text:', fullText);
}

main().catch(console.error);
