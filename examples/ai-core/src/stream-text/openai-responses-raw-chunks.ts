import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

async function main() {
  const model = openai.responses('o3-mini');

  console.log('=== OPENAI RESPONSES RAW STREAMING CHUNKS ===');

  const { stream } = await model.doStream({
    prompt: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'How many "r"s are in the word "strawberry"?' },
        ],
      },
    ],
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'auto',
      },
    },
    includeRawChunks: true,
  });

  let textChunkCount = 0;
  let reasoningChunkCount = 0;
  let rawChunkCount = 0;
  let fullText = '';
  let fullReasoning = '';

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

      if (chunk.type === 'reasoning-delta') {
        reasoningChunkCount++;
        fullReasoning += chunk.delta;
      }
    }
  } finally {
    reader.releaseLock();
  }

  console.log();
  console.log('Text chunks:', textChunkCount);
  console.log('Reasoning chunks:', reasoningChunkCount);
  console.log('Raw chunks:', rawChunkCount);
  console.log('Final text:', fullText);
  console.log('Final reasoning:', fullReasoning);
}

main().catch(console.error);
