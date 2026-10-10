import { APICallError } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { getStepMetadata } from 'workflow';

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type MockStreamPart = MockStreamResult extends {
  stream: ReadableStream<infer PART>;
}
  ? PART
  : never;

class SerializableRetryingModel extends MockLanguageModelV4 {
  static [WORKFLOW_SERIALIZE](model: SerializableRetryingModel) {
    return {
      failuresBeforeSuccess: model.failuresBeforeSuccess,
      failurePoint: model.failurePoint,
    };
  }

  static [WORKFLOW_DESERIALIZE](options: {
    failuresBeforeSuccess: number;
    failurePoint: 'dispatch' | 'stream-read';
  }) {
    return new SerializableRetryingModel(
      options.failuresBeforeSuccess,
      options.failurePoint,
    );
  }

  constructor(
    readonly failuresBeforeSuccess: number,
    readonly failurePoint: 'dispatch' | 'stream-read' = 'dispatch',
  ) {
    let modelAttempts = 0;

    super({
      provider: 'workflow-retry-test',
      modelId: 'workflow-retry-test-model',
      doStream: async () => {
        modelAttempts++;

        if (modelAttempts <= failuresBeforeSuccess) {
          const error = new APICallError({
            message: `model call failed on attempt ${modelAttempts}`,
            url: 'https://example.com/model',
            requestBodyValues: {},
            statusCode: 500,
            responseHeaders: { 'retry-after-ms': '0' },
          });

          if (failurePoint === 'dispatch') {
            throw error;
          }

          const failedAttemptParts: MockStreamPart[] = [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            {
              type: 'text-delta',
              id: '1',
              delta: `partial-attempt-${modelAttempts}`,
            },
          ];
          return {
            stream: new ReadableStream({
              pull(controller) {
                const part = failedAttemptParts.shift();
                if (part != null) {
                  controller.enqueue(part);
                } else {
                  controller.error(error);
                }
              },
            }),
          };
        }

        const text = `model-attempts=${modelAttempts};step-attempt=${getStepMetadata().attempt}`;
        const streamParts: MockStreamPart[] = [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: text },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
          },
        ];

        return { stream: convertArrayToReadableStream(streamParts) };
      },
    });
  }
}

// Keep construction outside the workflow module to avoid the SWC closure
// transformation issue tracked in https://github.com/vercel/workflow/issues/1365.
export function retryingModel(): MockLanguageModelV4 {
  return new SerializableRetryingModel(2);
}

export function retryingStreamReadModel(): MockLanguageModelV4 {
  return new SerializableRetryingModel(1, 'stream-read');
}
