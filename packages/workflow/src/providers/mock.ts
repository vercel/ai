import { mockProvider } from './mock-function-wrapper.js';

export type MockResponseDescriptor =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolName: string; input: string };

/**
 * Mock model that returns a fixed text response.
 */
export function mockTextModel(text: string) {
  return mockProvider({
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          for (const v of [
            { type: 'stream-start', warnings: [] },
            {
              type: 'response-metadata',
              id: 'r',
              modelId: 'mock',
              timestamp: new Date(),
            },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: text },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 5, noCache: 5 },
                outputTokens: { total: 10, text: 10 },
              },
            },
          ] as any[])
            c.enqueue(v);
          c.close();
        },
      }),
    }),
  });
}

/**
 * Mock model that plays through a sequence of responses.
 * Determines which response to return by counting assistant messages in the prompt.
 */
export function mockSequenceModel(responses: MockResponseDescriptor[]) {
  return mockProvider({
    doStream: async (options: any) => {
      const idx = Math.min(
        options.prompt.filter((m: any) => m.role === 'assistant').length,
        responses.length - 1,
      );
      const r = responses[idx];
      const parts =
        r.type === 'text'
          ? [
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'r',
                modelId: 'mock',
                timestamp: new Date(),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: r.text },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: {
                  inputTokens: { total: 5, noCache: 5 },
                  outputTokens: { total: 10, text: 10 },
                },
              },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'r',
                modelId: 'mock',
                timestamp: new Date(),
              },
              {
                type: 'tool-call',
                toolCallId: `call-${idx + 1}`,
                toolName: r.toolName,
                input: r.input,
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: undefined },
                usage: {
                  inputTokens: { total: 5, noCache: 5 },
                  outputTokens: { total: 10, text: 10 },
                },
              },
            ];
      return {
        stream: new ReadableStream({
          start(c) {
            for (const p of parts as any[]) c.enqueue(p);
            c.close();
          },
        }),
      };
    },
  });
}
