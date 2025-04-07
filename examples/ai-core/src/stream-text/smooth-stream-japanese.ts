import { simulateReadableStream, smoothStream, streamText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';

async function main() {
  const result = streamText({
    model: new MockLanguageModelV1({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-delta', textDelta: 'こんにちは' },
            { type: 'text-delta', textDelta: 'こんにちは' },
            { type: 'text-delta', textDelta: 'こんにちは' },
            { type: 'text-delta', textDelta: 'こんにちは' },
            { type: 'text-delta', textDelta: 'こんにちは' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ],
          chunkDelayInMs: 400,
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    }),

    prompt: 'Say hello in Japanese!',
    experimental_transform: smoothStream({
      chunking: /[\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
    }),
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
