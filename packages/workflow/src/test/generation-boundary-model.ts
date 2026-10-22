import { APICallError } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { MockLanguageModelV4 } from 'ai/test';
import { getStepMetadata, getWritable } from 'workflow';

export type BoundaryScenario = 'retry' | 'deadline' | 'abort' | 'rich' | 'hook';

const usage = {
  inputTokens: { total: 3, noCache: 2, cacheRead: 1, cacheWrite: undefined },
  outputTokens: { total: 2, text: 1, reasoning: 1 },
};

class BoundaryModel extends MockLanguageModelV4 {
  static [WORKFLOW_SERIALIZE](model: BoundaryModel) {
    return { scenario: model.scenario };
  }
  static [WORKFLOW_DESERIALIZE]({ scenario }: { scenario: BoundaryScenario }) {
    return new BoundaryModel(scenario);
  }
  constructor(readonly scenario: BoundaryScenario) {
    let calls = 0;
    super({
      provider: 'boundary-test',
      modelId: 'boundary-model',
      doGenerate: async options => {
        calls++;
        const writer = getWritable().getWriter();
        try {
          await writer.write({
            modelAttempt: calls,
            stepAttempt: getStepMetadata().attempt,
          });
        } finally {
          writer.releaseLock();
        }
        if (scenario === 'abort')
          throw new DOMException('Provider aborted.', 'AbortError');
        if (scenario === 'deadline' || (scenario === 'retry' && calls < 3)) {
          throw new APICallError({
            message: 'Retryable fixture failure',
            url: 'https://example.com/model',
            requestBodyValues: {},
            statusCode: 503,
            responseHeaders: {
              'retry-after-ms': scenario === 'deadline' ? '10000' : '0',
            },
          });
        }
        if (
          scenario === 'hook' &&
          !options.prompt.some(message => message.role === 'assistant')
        ) {
          return {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'wait-call',
                toolName: 'wait',
                input: '{}',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage,
            warnings: [],
          };
        }
        return {
          content:
            scenario === 'rich'
              ? [
                  {
                    type: 'reasoning',
                    text: 'Reasoning.',
                    providerMetadata: { fixture: { reasoning: true } },
                  },
                  { type: 'text', text: 'Answer.' },
                  {
                    type: 'file',
                    data: { type: 'data', data: new Uint8Array([104, 105]) },
                    mediaType: 'text/plain',
                    providerMetadata: { fixture: { file: true } },
                  },
                  {
                    type: 'source',
                    sourceType: 'url',
                    id: 'source',
                    url: 'https://example.com/source',
                  },
                ]
              : [{ type: 'text', text: 'Recovered.' }],
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage,
          warnings: [{ type: 'other', message: 'fixture warning' }],
          providerMetadata: { fixture: { calls } },
          request: { body: 'request body' },
          response: {
            id: 'boundary-response',
            timestamp: new Date('2026-01-02T00:00:00Z'),
            modelId: 'response-model',
            headers: { 'x-fixture': 'yes' },
            body: { fixture: 'response' },
          },
        };
      },
    });
  }
}

// Keep construction outside workflow modules for the SWC closure transform.
export function generationBoundaryModel(scenario: BoundaryScenario) {
  return new BoundaryModel(scenario);
}
