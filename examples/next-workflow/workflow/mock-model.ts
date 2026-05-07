import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

export type MockResponseDescriptor =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolName: string; input: string }
  | { type: 'error'; message: string };

const usage = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 10, text: 10 },
};

function mockProvider(
  ...args: ConstructorParameters<typeof MockLanguageModelV4>
) {
  return new MockLanguageModelV4(...args);
}

export function mockSequenceModel(responses: MockResponseDescriptor[]) {
  return mockProvider({
    provider: 'workflow-telemetry-mock',
    modelId: 'workflow-telemetry-model',
    doStream: async (options: any) => {
      const index = Math.min(
        options.prompt.filter((message: any) => message.role === 'assistant')
          .length,
        responses.length - 1,
      );
      const response = responses[index];

      if (response.type === 'error') {
        throw new Error(response.message);
      }

      const prefix = [
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: `response-${index}`,
          modelId: 'workflow-telemetry-model',
          timestamp: new Date('2026-05-06T00:00:00.000Z'),
        },
      ] as any[];

      return {
        stream: convertArrayToReadableStream(
          response.type === 'text'
            ? ([
                ...prefix,
                { type: 'text-start', id: `text-${index}` },
                {
                  type: 'text-delta',
                  id: `text-${index}`,
                  delta: response.text,
                },
                { type: 'text-end', id: `text-${index}` },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ] as any[])
            : ([
                ...prefix,
                {
                  type: 'tool-call',
                  toolCallId: `call-${index + 1}`,
                  toolName: response.toolName,
                  input: response.input,
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: undefined },
                  usage,
                },
              ] as any[]),
        ) as any,
      };
    },
  });
}
