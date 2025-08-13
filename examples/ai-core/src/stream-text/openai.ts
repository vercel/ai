import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const chunks: any[] = [];
  const result = streamText({
    model: openai('gpt-4.1-nano'),
    maxOutputTokens: 1024,
    messages: [{ role: 'user', content: 'Output Y or N.' }],
    providerOptions: {
      openai: {
        logprobs: 5,
      },
    },
    includeRawChunks: true,
    onChunk: ({ chunk }) => {
      chunks.push(chunk.rawValue);
    },
  });

  for await (const textPart of result.textStream) {
  }

  console.log(
    chunks.filter(Boolean).map(c => 'data:' + JSON.stringify(c) + '\n\n'),
  );
}

main().catch(console.error);
