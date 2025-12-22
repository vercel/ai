import { simulateReadableStream, smoothStream, streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

async function main() {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: '0' },
            { type: 'text-delta', id: '0', delta: '你好你好你好你好你好' },
            { type: 'text-delta', id: '0', delta: '你好你好你好你好你好' },
            { type: 'text-delta', id: '0', delta: '你好你好你好你好你好' },
            { type: 'text-delta', id: '0', delta: '你好你好你好你好你好' },
            { type: 'text-delta', id: '0', delta: '你好你好你好你好你好' },
            { type: 'text-end', id: '0' },
            {
              type: 'finish',
              finishReason: { raw: undefined, unified: 'stop' },
              logprobs: undefined,
              usage: {
                inputTokens: {
                  total: 3,
                  noCache: 3,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 10,
                  text: 10,
                  reasoning: undefined,
                },
              },
            },
          ],
          chunkDelayInMs: 400,
        }),
      }),
    }),

    prompt: 'Say hello in Chinese!',
    experimental_transform: smoothStream({
      chunking: /[\u4E00-\u9FFF]|\S+\s+/,
    }),
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
