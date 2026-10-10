import assert from 'node:assert/strict';
import { OpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import {
  experimental_decide,
  type Experimental_DecisionModelCallEndEvent,
} from 'ai';
import { Experimental_DecisionMockModelV4 } from 'ai/test';

async function main() {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer('issue-22538');
  let callEndResponse:
    | Experimental_DecisionModelCallEndEvent['response']
    | undefined;

  try {
    const result = await experimental_decide({
      model: new Experimental_DecisionMockModelV4({
        modelId: 'mock-model-alias',
        doDecide: async () => ({
          answers: { refund: { type: 'boolean', probability: 0.9 } },
          usage: { inputTokens: 12, outputTokens: 2 },
          warnings: [],
          response: {
            id: 'response-id',
            modelId: 'mock-model-resolved',
          },
        }),
      }),
      state: { message: 'Please refund me' },
      questions: {
        refund: { type: 'boolean', instructions: 'Refund?' },
      },
      telemetry: {
        integrations: [
          new OpenTelemetry({ tracer }),
          {
            experimental_onDecisionModelCallEnd(event) {
              callEndResponse = event.response;
            },
          },
        ],
      },
    });

    assert.equal(result.response.id, 'response-id');
    assert.equal(result.response.modelId, 'mock-model-resolved');
    assert.deepEqual(callEndResponse, {
      id: 'response-id',
      modelId: 'mock-model-resolved',
    });

    const decisionModelSpan = exporter
      .getFinishedSpans()
      .find(
        span =>
          span.name === 'decide mock-model-alias' &&
          span.attributes['gen_ai.usage.input_tokens'] === 12,
      );

    assert.ok(
      decisionModelSpan,
      'Expected the child decision model span with token usage',
    );
    assert.equal(
      decisionModelSpan.attributes['gen_ai.request.model'],
      'mock-model-alias',
    );

    const responseModel = decisionModelSpan.attributes['gen_ai.response.model'];
    const responseId = decisionModelSpan.attributes['gen_ai.response.id'];

    if (
      responseModel !== 'mock-model-resolved' ||
      responseId !== 'response-id'
    ) {
      throw new Error(
        'ISSUE #22538 reproduced: decision model span omitted gen_ai.response.model and gen_ai.response.id',
      );
    }
  } finally {
    await provider.shutdown();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
