import { experimental_streamText } from 'ai';
import { OpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const abortController = new AbortController();

  // run async:
  (async () => {
    await delay(1500); // wait 1.5 seconds
    abortController.abort(); // aborts the streaming
  })();

  try {
    const { textStream } = await experimental_streamText({
      model: openai.chat('gpt-3.5-turbo'),
      prompt: 'Write a short story about a robot learning to love:\n\n',
      abortSignal: abortController.signal,
    });

    for await (const textPart of textStream) {
      process.stdout.write(textPart);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('\n\nAbortError: The run was aborted.');
    }
  }
}

main().catch(console.error);

async function delay(delayInMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayInMs));
}
