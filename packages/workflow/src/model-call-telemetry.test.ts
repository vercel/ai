import { OpenTelemetry, OpenTelemetryIdGenerator } from '@ai-sdk/otel';
import { context, trace, type Context } from '@opentelemetry/api';
import {
  AlwaysOffSampler,
  ParentBasedSampler,
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildModelStepResult } from './build-model-step-result.js';
import { doGenerateStep } from './do-generate-step.js';
import {
  createWorkflowAgentTelemetryRecorder,
  prepareWorkflowAgentTelemetry,
  reportWorkflowAgentTelemetry,
} from './workflow-agent-telemetry.js';

afterEach(() => {
  context.disable();
  vi.unstubAllGlobals();
});

describe('live model-step tracing', () => {
  it.each(['legacy', 'durable', 'disabled sampling'] as const)(
    '%s: preserves provider context without duplicating model spans',
    async mode => {
      // The fixture starts its provider span synchronously inside the wrapper.
      // No async context-manager dependency is needed for this assertion.
      let activeContext = context.active();
      context.setGlobalContextManager({
        active: () => activeContext,
        with: (next: Context, fn, thisArg, ...args) => {
          const previous = activeContext;
          activeContext = next;
          try {
            return fn.call(thisArg, ...args);
          } finally {
            activeContext = previous;
          }
        },
        bind: (_context, target) => target,
        enable() {
          return this;
        },
        disable() {
          return this;
        },
      });
      const exporter = new InMemorySpanExporter();
      // Constructing an unused bridge must not change the default tracing path.
      const bridge = new OpenTelemetryIdGenerator({
        sampler:
          mode === 'disabled sampling'
            ? new ParentBasedSampler({ root: new AlwaysOffSampler() })
            : undefined,
      });
      const durable = mode === 'legacy' ? undefined : bridge;
      const provider = new BasicTracerProvider({
        idGenerator: durable,
        sampler: durable,
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      const tracer = provider.getTracer('test');
      const integration = new OpenTelemetry({ tracer, durable });
      const received = vi.fn();
      vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
        integration,
        { onEnd: received },
      ]);
      const recorder = createWorkflowAgentTelemetryRecorder();
      const record = recorder.integration as Record<
        string,
        (event: any) => void
      >;
      record.onStart({
        operationId: 'ai.workflowAgent.stream',
        provider: 'mock-provider',
        modelId: 'mock-model-id',
        messages: [{ role: 'user', content: 'hello' }],
      });
      recorder.contexts = await prepareWorkflowAgentTelemetry({
        callId: recorder.callId,
        event: recorder.events[0],
      });
      record.onStepStart({ stepNumber: 0, steps: [], messages: [] });
      let activeModelContext: ReturnType<typeof trace.getSpanContext>;
      const result = await doGenerateStep(
        [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        new MockLanguageModelV4({
          doGenerate: async () => {
            activeModelContext = trace.getSpanContext(context.active());
            tracer.startSpan('provider request').end();
            return {
              content: [
                { type: 'text', text: 'world' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
                },
              ],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
              warnings: [],
            };
          },
        }),
        {},
        {
          telemetry: {
            callId: recorder.callId,
            stepNumber: 0,
            contexts: recorder.contexts,
          },
        },
      );
      expect(activeModelContext!).toBeDefined();
      expect(activeModelContext!.traceFlags).toBe(
        mode === 'disabled sampling' ? 0 : 1,
      );
      if (result.aborted) throw new Error('Unexpected abort');
      const step = await buildModelStepResult(
        result.raw,
        result.toolCalls,
        result.finish,
        result.providerExecutedToolResults,
        {
          callId: recorder.callId,
          stepNumber: 0,
          runtimeContext: {},
          toolsContext: {},
        },
      );
      record.onStepEnd(step);
      record.onEnd({ steps: [step], totalUsage: step.usage });
      const liveNames = exporter.getFinishedSpans().map(span => span.name);
      expect(liveNames).toEqual(
        mode === 'durable'
          ? ['provider request', 'chat mock-model-id']
          : mode === 'legacy'
            ? [
                'provider request',
                'chat mock-model-id',
                'step 1',
                'invoke_agent mock-model-id',
              ]
            : [],
      );
      await reportWorkflowAgentTelemetry({
        telemetry: {},
        events: structuredClone(recorder.events),
        contexts: recorder.contexts,
        callId: recorder.callId,
      });
      expect(received).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'world' }),
      );
      const spans = exporter.getFinishedSpans();
      if (mode === 'disabled sampling') {
        expect(spans).toEqual([]);
      } else {
        expect(spans).toHaveLength(4);
        const chat = spans.find(span => span.name === 'chat mock-model-id')!;
        expect(chat.attributes['gen_ai.output.messages']).toContain('AQID');
        const request = spans.find(span => span.name === 'provider request')!;
        const step = spans.find(span => span.name === 'step 1')!;
        expect(request.parentSpanContext?.spanId).toBe(
          chat.spanContext().spanId,
        );
        expect(chat.parentSpanContext?.spanId).toBe(step.spanContext().spanId);
        expect(
          new Set(spans.map(span => span.spanContext().traceId)).size,
        ).toBe(1);
      }
    },
  );
});
