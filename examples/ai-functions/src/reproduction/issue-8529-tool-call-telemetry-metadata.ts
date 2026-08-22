import { LegacyOpenTelemetry } from '@ai-sdk/otel';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const metadataAttribute = 'ai.settings.context.requestId';
const metadataValue = 'issue-8529-request';

async function main() {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = tracerProvider.getTracer('issue-8529-reproduction');

  await generateText({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{"query":"telemetry"}',
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
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
        warnings: [],
      },
    }),
    prompt: 'Look up telemetry.',
    tools: {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => `result for ${query}`,
      }),
    },
    runtimeContext: {
      requestId: metadataValue,
    },
    telemetry: {
      isEnabled: true,
      functionId: 'issue-8529',
      includeRuntimeContext: {
        requestId: true,
      },
      integrations: new LegacyOpenTelemetry({ tracer }),
    },
  });

  await tracerProvider.forceFlush();

  const spans = exporter.getFinishedSpans();
  const rootSpan = spans.find(span => span.name === 'ai.generateText');
  const toolCallSpan = spans.find(span => span.name === 'ai.toolCall');

  if (rootSpan == null) {
    throw new Error('Expected an ai.generateText span.');
  }

  if (toolCallSpan == null) {
    throw new Error('Expected an ai.toolCall span.');
  }

  const output = {
    metadataAttribute,
    rootSpanMetadata: rootSpan.attributes[metadataAttribute],
    toolCallSpanMetadata: toolCallSpan.attributes[metadataAttribute],
    toolCallSpanAttributes: toolCallSpan.attributes,
  };

  console.log(JSON.stringify(output, null, 2));

  if (rootSpan.attributes[metadataAttribute] !== metadataValue) {
    throw new Error(
      `Reproduction setup failed: the root span did not contain ${metadataAttribute}.`,
    );
  }

  if (toolCallSpan.attributes[metadataAttribute] !== metadataValue) {
    throw new Error(
      `Reproduced issue #8529: ai.toolCall is missing the call-level telemetry attribute ${metadataAttribute}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
