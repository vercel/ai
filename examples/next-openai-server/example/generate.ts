import { createRemoteProvider } from '@ai-sdk/remote-provider';
import { generateText } from 'ai';

const remote = createRemoteProvider({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'abc',
});

async function main() {
  const { text, usage } = await generateText({
    model: remote('anthropic/claude-3-5-haiku-20241022'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 0,
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
