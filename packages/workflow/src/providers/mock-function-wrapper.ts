import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import type { MockResponseDescriptor } from './mock.js';

type MockStreamOptions = Parameters<MockLanguageModelV4['doStream']>[0];
type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type MockStreamPart = MockStreamResult extends {
  stream: ReadableStream<infer PART>;
}
  ? PART
  : never;

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

class SerializableMockLanguageModel extends MockLanguageModelV4 {
  static [WORKFLOW_SERIALIZE](model: SerializableMockLanguageModel) {
    return { responses: model.responses };
  }

  static [WORKFLOW_DESERIALIZE](options: {
    responses: MockResponseDescriptor[];
  }) {
    return new SerializableMockLanguageModel(options.responses);
  }

  constructor(private readonly responses: MockResponseDescriptor[]) {
    super({
      provider: 'workflow-test',
      modelId: 'workflow-test-model',
      doStream: async (options: MockStreamOptions) => {
        const responseIndex = Math.min(
          options.prompt.filter(message => message.role === 'assistant').length,
          responses.length - 1,
        );
        const response = responses[responseIndex];
        const prefix: MockStreamPart[] = [
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'r',
            modelId: 'mock',
            timestamp: new Date(),
          },
        ];
        const streamParts: MockStreamPart[] =
          response.type === 'text'
            ? [
                ...prefix,
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: response.text },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ]
            : response.type === 'tool-call'
              ? [
                  ...prefix,
                  {
                    type: 'tool-call',
                    toolCallId: `call-${responseIndex + 1}`,
                    toolName: response.toolName,
                    input: response.input,
                  },
                  {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: undefined },
                    usage,
                  },
                ]
              : [
                  ...prefix,
                  { type: 'error', error: response.error },
                  {
                    type: 'finish',
                    finishReason: { unified: 'error', raw: 'error' },
                    usage,
                  },
                ];

        return { stream: convertArrayToReadableStream(streamParts) };
      },
    });
  }
}

// Workaround for SWC plugin bug (https://github.com/vercel/workflow/issues/1365):
// `new ClassName(...)` in a step closure doesn't get closure vars hoisted
// correctly. Wrapping the constructor call in a plain function (imported
// from a separate file) fixes it.
export function mockProvider(
  responses: MockResponseDescriptor[],
): MockLanguageModelV4 {
  return new SerializableMockLanguageModel(responses);
}
