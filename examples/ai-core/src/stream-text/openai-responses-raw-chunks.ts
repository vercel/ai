import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: openai.responses('o3-mini'),
    prompt: 'How many "r"s are in the word "strawberry"?',
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

  for await (const chunk of result.fullStream) {
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
      fullText += chunk.text;
    }

    if (chunk.type === 'reasoning-delta') {
      reasoningChunkCount++;
      fullReasoning += chunk.text;
    }
  }

  console.log();
  console.log('Text chunks:', textChunkCount);
  console.log('Reasoning chunks:', reasoningChunkCount);
  console.log('Raw chunks:', rawChunkCount);
  console.log('Final text:', fullText);
  console.log('Final reasoning:', fullReasoning);
}

main().catch(console.error);
