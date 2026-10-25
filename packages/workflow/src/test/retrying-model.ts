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
    return { failuresBeforeSuccess: model.failuresBeforeSuccess };
  }

  static [WORKFLOW_DESERIALIZE](options: { failuresBeforeSuccess: number }) {
    return new SerializableRetryingModel(options.failuresBeforeSuccess);
  }

  constructor(readonly failuresBeforeSuccess: number) {
    let modelAttempts = 0;

    super({
      provider: 'workflow-retry-test',
      modelId: 'workflow-retry-test-model',
      doStream: async () => {
        modelAttempts++;

        if (modelAttempts <= failuresBeforeSuccess) {
          throw new APICallError({
            message: `model call failed on attempt ${modelAttempts}`,
            url: 'https://example.com/model',
            requestBodyValues: {},
            statusCode: 500,
            responseHeaders: { 'retry-after-ms': '0' },
          });
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

// Stream retries run each attempt as a new durable step, which deserializes a
// new model instance. Count attempts per test run outside the instance.
const streamErrorAttemptsByKey = new Map<string, number>();

type StreamFailure = 'error-part' | 'read';

class SerializableStreamErrorModel extends MockLanguageModelV4 {
  static [WORKFLOW_SERIALIZE](model: SerializableStreamErrorModel) {
    return {
      key: model.key,
      failuresBeforeSuccess: model.failuresBeforeSuccess,
      failure: model.failure,
    };
  }

  static [WORKFLOW_DESERIALIZE](options: {
    key: string;
    failuresBeforeSuccess: number;
    failure: StreamFailure;
  }) {
    return new SerializableStreamErrorModel(
      options.key,
      options.failuresBeforeSuccess,
      options.failure,
    );
  }

  constructor(
    readonly key: string,
    readonly failuresBeforeSuccess: number,
    readonly failure: StreamFailure,
  ) {
    super({
      provider: 'workflow-stream-retry-test',
      modelId: 'workflow-stream-retry-test-model',
      doStream: async () => {
        const attempt = (streamErrorAttemptsByKey.get(key) ?? 0) + 1;
        streamErrorAttemptsByKey.set(key, attempt);
        const failed = attempt <= failuresBeforeSuccess;
        const text = failed
          ? `partial-attempt-${attempt}`
          : `stream-attempts=${attempt};step-attempt=${getStepMetadata().attempt}`;

        if (failed && failure === 'read') {
          const parts: MockStreamPart[] = [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: text },
          ];
          // What provider-utils produces when the socket drops after HTTP 200.
          const error = new APICallError({
            message: `stream read failed on attempt ${attempt}`,
            url: 'https://example.com/model',
            requestBodyValues: {},
            statusCode: 200,
            isRetryable: true,
          });
          return {
            stream: new ReadableStream<MockStreamPart>({
              pull(controller) {
                const part = parts.shift();
                if (part != null) {
                  controller.enqueue(part);
                } else {
                  controller.error(error);
                }
              },
            }),
          };
        }
        const streamParts: MockStreamPart[] = [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: text },
          ...(failed
            ? [
                {
                  type: 'error' as const,
                  error: {
                    message: `stream failed on attempt ${attempt}`,
                    statusCode: 503,
                  },
                },
              ]
            : [{ type: 'text-end' as const, id: '1' }]),
          {
            type: 'finish',
            finishReason: failed
              ? { unified: 'error', raw: 'error' }
              : { unified: 'stop', raw: 'stop' },
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

export function streamErrorModel(
  key: string,
  failuresBeforeSuccess: number,
  failure: StreamFailure = 'error-part',
): MockLanguageModelV4 {
  return new SerializableStreamErrorModel(key, failuresBeforeSuccess, failure);
}
