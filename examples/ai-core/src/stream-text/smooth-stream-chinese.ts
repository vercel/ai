import { simulateReadableStream, smoothStream, streamText } from 'ai';
<<<<<<< HEAD
import { MockLanguageModelV1 } from 'ai/test';

async function main() {
  const result = streamText({
    model: new MockLanguageModelV1({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-delta', textDelta: '你好你好你好你好你好' },
            { type: 'text-delta', textDelta: '你好你好你好你好你好' },
            { type: 'text-delta', textDelta: '你好你好你好你好你好' },
            { type: 'text-delta', textDelta: '你好你好你好你好你好' },
            { type: 'text-delta', textDelta: '你好你好你好你好你好' },
=======
import { MockLanguageModelV2 } from 'ai/test';

async function main() {
  const result = streamText({
    model: new MockLanguageModelV2({
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
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
<<<<<<< HEAD
              usage: { completionTokens: 10, promptTokens: 3 },
=======
              usage: {
                inputTokens: 3,
                outputTokens: 10,
                totalTokens: 13,
              },
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
            },
          ],
          chunkDelayInMs: 400,
        }),
<<<<<<< HEAD
        rawCall: { rawPrompt: null, rawSettings: {} },
=======
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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
