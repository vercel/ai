import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-5.4'),
    prompt: 'Say ok.',
    maxRetries: 0,
    providerOptions: { openai: { store: false } },
  });
  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part));
  }
  console.log('finish', await result.finishReason);
}
main().catch(e => { console.error(e); process.exit(1); });
