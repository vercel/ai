import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod/v4';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-5.4'),
    prompt: 'Say ok without tools.',
    maxRetries: 0,
    maxOutputTokens: 16,
    tools: {
      createKid: tool({
        description: 'Create kid profile',
        inputSchema: z.object({ email: z.email(), kidId: z.uuid(), birthDate: z.iso.date() }),
      }),
    },
    include: { requestBody: true, rawChunks: true },
    providerOptions: { openai: { store: false } },
  });
  for await (const part of result.fullStream) {
    if (part.type === 'start-step') console.dir(part.request.body, { depth: 20 });
    if (part.type === 'raw') console.log('RAW', JSON.stringify(part.rawValue));
    if (part.type === 'error') console.log('ERRPART', part.error);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
