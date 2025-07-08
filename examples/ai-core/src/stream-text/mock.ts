import { streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: 'Hello' },
          { type: 'text-delta', id: '0', delta: ', ' },
          { type: 'text-delta', id: '0', delta: `world!` },
          { type: 'text-end', id: '0' },
          {
            type: 'finish',
            finishReason: 'stop',
            logprobs: undefined,
            usage: {
              inputTokens: 3,
              outputTokens: 10,
              totalTokens: 13,
            },
          },
        ]),
      }),
    }),
    prompt: 'Hello, test!',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
