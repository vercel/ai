import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { Output, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const chunkSize = Number(process.argv[2] ?? 12);
const words =
  'the cell membrane controls which substances enter and leave the cell ';

for (const count of [50, 100, 200]) {
  let validations = 0;
  const element = z
    .object({
      question: z.string(),
      choices: z.array(z.string()).length(4),
      answerIdx: z.number(),
      explanation: z.string(),
    })
    .superRefine(() => {
      validations++;
    });

  const text = JSON.stringify({
    elements: Array.from({ length: count }, (_, i) => ({
      question: `Q${i} ${words.repeat(2)}`,
      choices: [1, 2, 3, 4].map(choice => `${choice} ${words}`),
      answerIdx: i % 4,
      explanation: words.repeat(5),
    })),
  });

  const stream = new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'text' });
      for (let i = 0; i < text.length; i += chunkSize) {
        controller.enqueue({
          type: 'text-delta',
          id: 'text',
          delta: text.slice(i, i + chunkSize),
        });
      }
      controller.enqueue({ type: 'text-end', id: 'text' });
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      });
      controller.close();
    },
  });

  const result = streamText({
    model: new MockLanguageModelV4({ doStream: async () => ({ stream }) }),
    prompt: 'Return elements',
    output: Output.array({ element }),
  });

  const start = process.cpuUsage();
  let emitted = 0;
  for await (const _ of result.elementStream) {
    emitted++;
  }
  const cpu = process.cpuUsage(start);

  console.log({
    elements: count,
    chunks: Math.ceil(text.length / chunkSize),
    emitted,
    validations,
    cpuSeconds: Number(((cpu.user + cpu.system) / 1e6).toFixed(1)),
  });
}
