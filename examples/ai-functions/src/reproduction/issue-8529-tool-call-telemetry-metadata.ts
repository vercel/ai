import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { generateText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const metadataAttribute = 'ai.telemetry.metadata.requestId';
const metadataValue = 'issue-8529-request';

async function main() {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  try {
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'weather-call',
              toolName: 'weather',
              input: '{"city":"San Francisco"}',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
          usage: {
            inputTokens: {
              total: 4,
              noCache: 4,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 2,
              text: 2,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
      }),
      prompt: 'What is the weather in San Francisco?',
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, condition: 'sunny' }),
        }),
      },
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          requestId: metadataValue,
        },
        tracer: tracerProvider.getTracer('issue-8529'),
      },
    });

    const spans = exporter.getFinishedSpans();
    const generateTextSpan = spans.find(
      span => span.name === 'ai.generateText',
    );
    const toolCallSpan = spans.find(span => span.name === 'ai.toolCall');

    if (generateTextSpan == null) {
      throw new Error('Expected an ai.generateText telemetry span.');
    }
    if (toolCallSpan == null) {
      throw new Error('Expected an ai.toolCall telemetry span.');
    }
    if (generateTextSpan.attributes[metadataAttribute] !== metadataValue) {
      throw new Error(
        `Expected ai.generateText to contain ${metadataAttribute}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          generateTextMetadata:
            generateTextSpan.attributes[metadataAttribute] ?? null,
          toolCallMetadata: toolCallSpan.attributes[metadataAttribute] ?? null,
          toolCallAttributes: toolCallSpan.attributes,
        },
        null,
        2,
      ),
    );

    if (toolCallSpan.attributes[metadataAttribute] !== metadataValue) {
      throw new Error(
        'ISSUE_8529_REPRODUCED: ai.toolCall span is missing ai.telemetry.metadata.requestId',
      );
    }

    console.log('Issue #8529 is not reproduced.');
  } finally {
    await tracerProvider.shutdown();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
