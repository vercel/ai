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

// Keep construction outside the workflow module to avoid the SWC closure
// transformation issue tracked in https://github.com/vercel/workflow/issues/1365.
export function retryingModel(): MockLanguageModelV4 {
  return new SerializableRetryingModel(2);
}
