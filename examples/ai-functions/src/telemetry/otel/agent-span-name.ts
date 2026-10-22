import { OpenTelemetry, type OpenTelemetryOptions } from '@ai-sdk/otel';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { generateText, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer('agent-span-name-example');
  const usage = {
    inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };

  // Mock the model so this example requires no API keys or network requests.
  const model = new MockLanguageModelV4({
    modelId: 'mock-model',
    doGenerate: {
      content: [{ type: 'text', text: 'Hello!' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello!' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  const examples: {
    label: string;
    agentSpanName?: OpenTelemetryOptions['agentSpanName'];
    functionId?: string;
  }[] = [
    { label: 'Default', functionId: 'travel-planner' },
    {
      label: 'Function ID',
      agentSpanName: 'functionId',
      functionId: 'travel-planner',
    },
    {
      label: 'Custom name',
      agentSpanName: ({ modelId, functionId }) =>
        `my-app ${functionId ?? modelId}`,
      functionId: 'travel-planner',
    },
    { label: 'Missing function ID', agentSpanName: 'functionId' },
  ];

  try {
    for (const { label, agentSpanName, functionId } of examples) {
      const telemetry = {
        functionId,
        integrations: [new OpenTelemetry({ tracer, agentSpanName })],
      };

      await generateText({ model, prompt: 'Say hello.', telemetry });
      await provider.forceFlush();
      console.log(`${label}: generateText`);
      console.table(
        exporter.getFinishedSpans().map(span => ({
          name: span.name,
          operation: span.attributes['gen_ai.operation.name'],
        })),
      );
      exporter.reset();

      await streamText({
        model,
        prompt: 'Say hello.',
        telemetry,
      }).consumeStream();
      await provider.forceFlush();
      console.log(`${label}: streamText`);
      console.table(
        exporter.getFinishedSpans().map(span => ({
          name: span.name,
          operation: span.attributes['gen_ai.operation.name'],
        })),
      );
      exporter.reset();
    }
  } finally {
    await provider.shutdown();
  }
});
