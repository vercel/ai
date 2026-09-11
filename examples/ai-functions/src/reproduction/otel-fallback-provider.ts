import { OpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createFallback } from 'ai-fallback';

const usage = {
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
};

async function main() {
  const primary = new MockLanguageModelV4({
    provider: 'openai.chat',
    modelId: 'primary',
    doGenerate: async () => {
      throw new Error('overloaded');
    },
  });
  const fallback = new MockLanguageModelV4({
    provider: 'anthropic.messages',
    modelId: 'fallback-request',
    doGenerate: {
      content: [{ type: 'text', text: 'fallback succeeded' }],
      finishReason: { raw: undefined, unified: 'stop' },
      usage,
      warnings: [],
      response: { modelId: 'fallback' },
    },
  });
  const model = createFallback({ models: [primary, fallback] });

  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const endEvents: Array<{ provider: string; modelId: string }> = [];

  const result = await generateText({
    model,
    prompt: 'Use the fallback.',
    onLanguageModelCallEnd: event => {
      endEvents.push({
        provider: event.provider,
        modelId: event.modelId,
      });
    },
    telemetry: {
      integrations: new OpenTelemetry({
        tracer: tracerProvider.getTracer('issue-20646'),
      }),
    },
  });

  await tracerProvider.forceFlush();

  if (primary.doGenerateCalls.length !== 1) {
    throw new Error('Primary model was not attempted exactly once.');
  }
  if (fallback.doGenerateCalls.length !== 1) {
    throw new Error('Fallback model did not complete exactly once.');
  }
  if (result.text !== 'fallback succeeded') {
    throw new Error('Fallback result was not returned to the user.');
  }

  const endEvent = endEvents[0];
  if (
    endEvents.length !== 1 ||
    endEvent?.provider !== 'anthropic.messages' ||
    endEvent.modelId !== 'fallback'
  ) {
    throw new Error(
      `Unexpected onLanguageModelCallEnd result: ${JSON.stringify(endEvents)}`,
    );
  }

  const generationSpan = exporter
    .getFinishedSpans()
    .find(span => span.attributes['gen_ai.response.model'] === 'fallback');
  if (generationSpan == null) {
    throw new Error('No generation span recorded the fallback response model.');
  }

  const spanProvider = generationSpan.attributes['gen_ai.provider.name'];
  if (spanProvider !== 'anthropic') {
    throw new Error(
      `Issue #20646 reproduced: onLanguageModelCallEnd reported anthropic.messages for the successful fallback, but the generation span retained gen_ai.provider.name=${String(spanProvider)}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
