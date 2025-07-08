import { openai } from '@ai-sdk/openai';
import { createUiMessageIterable, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-4.1-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  const uiMessageIterable = createUiMessageIterable({
    stream: result.toUIMessageStream(),
  });

  for await (const uiMessage of uiMessageIterable) {
    console.clear();
    console.log(JSON.stringify(uiMessage, null, 2));
  }
}

main().catch(console.error);
