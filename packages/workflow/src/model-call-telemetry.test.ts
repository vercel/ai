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
import { doStreamStep } from './do-stream-step.js';
import {
  createWorkflowAgentTelemetryRecorder,
  getRecordedStartEvent,
  reportWorkflowAgentTelemetry,
} from './workflow-agent-telemetry.js';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function createTextModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'world' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    }),
  });
}

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'hello' }],
  },
];

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
      const captureContext = vi.spyOn(
        integration.experimental_durable,
        'captureContext',
      );
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
          // The first model step captures the contexts from the start event.
          telemetry: {
            callId: recorder.callId,
            stepNumber: 0,
            startEvent: structuredClone(getRecordedStartEvent(recorder.events)),
          },
        },
      );
      expect(captureContext).toHaveBeenCalledOnce();
      expect(captureContext).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: recorder.callId,
          operationId: 'ai.workflowAgent.stream',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      );
      recorder.contexts = structuredClone(result.telemetryContexts);
      expect(recorder.contexts).toEqual([
        mode === 'legacy'
          ? undefined
          : expect.objectContaining({
              rootSpanName: 'invoke_agent mock-model-id',
            }),
        undefined,
      ]);
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
      // A later model step receives the contexts and does not capture again.
      record.onStepStart({ stepNumber: 1, steps: [step], messages: [] });
      const second = await doGenerateStep(
        prompt,
        createTextModel(),
        {},
        {
          telemetry: {
            callId: recorder.callId,
            stepNumber: 1,
            contexts: recorder.contexts,
          },
        },
      );
      expect(captureContext).toHaveBeenCalledOnce();
      expect(second).not.toHaveProperty('telemetryContexts');
      if (second.aborted) throw new Error('Unexpected abort');
      const secondStep = await buildModelStepResult(
        second.raw,
        second.toolCalls,
        second.finish,
        second.providerExecutedToolResults,
        {
          callId: recorder.callId,
          stepNumber: 1,
          runtimeContext: {},
          toolsContext: {},
        },
      );
      record.onStepEnd(secondStep);
      const liveNames = exporter.getFinishedSpans().map(span => span.name);
      expect(liveNames).toEqual(
        mode === 'durable'
          ? ['provider request', 'chat mock-model-id', 'chat mock-model-id']
          : mode === 'legacy'
            ? [
                'provider request',
                'chat mock-model-id',
                'step 1',
                'invoke_agent mock-model-id',
                'chat mock-model-id',
                'step 1',
                'invoke_agent mock-model-id',
              ]
            : [],
      );
      record.onEnd({ steps: [step, secondStep], totalUsage: step.usage });
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
        expect(spans).toHaveLength(mode === 'durable' ? 6 : 7);
        const chat = spans.find(span => span.name === 'chat mock-model-id')!;
        expect(chat.attributes['gen_ai.output.messages']).toContain('AQID');
        const request = spans.find(span => span.name === 'provider request')!;
        const step = spans.find(span => span.name === 'step 1')!;
        expect(request.parentSpanContext?.spanId).toBe(
          chat.spanContext().spanId,
        );
        expect(chat.parentSpanContext?.spanId).toBe(step.spanContext().spanId);
        if (mode === 'durable') {
          // The contexts captured in the first model step parent the model
          // calls of both steps and the spans of the final report.
          const context = recorder.contexts![0]!;
          const root = spans.find(
            span => span.name === 'invoke_agent mock-model-id',
          )!;
          expect(root.spanContext().spanId).toBe(context.rootSpanId);
          expect(
            new Set(spans.map(span => span.spanContext().traceId)),
          ).toEqual(new Set([context.traceId]));
          const chats = spans.filter(
            span => span.name === 'chat mock-model-id',
          );
          const stepSpans = spans.filter(span => span.name.startsWith('step '));
          expect(stepSpans.map(span => span.name)).toEqual([
            'step 1',
            'step 2',
          ]);
          expect(chats.map(span => span.parentSpanContext?.spanId)).toEqual(
            stepSpans.map(span => span.spanContext().spanId),
          );
          for (const stepSpan of stepSpans) {
            expect(stepSpan.parentSpanContext?.spanId).toBe(context.rootSpanId);
          }
        }
      }
    },
  );
});

describe('durable context capture in the first model step', () => {
  it('returns no contexts when the workflow did not ask for a capture', async () => {
    const captureContext = vi.fn();
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
      { experimental_durable: { captureContext } },
    ]);
    const result = await doGenerateStep(
      prompt,
      createTextModel(),
      {},
      {
        telemetry: { callId: 'call-1', stepNumber: 0 },
      },
    );
    expect(captureContext).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('telemetryContexts');
  });

  it('returns an empty list when no integration is registered', async () => {
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', undefined);
    const result = await doGenerateStep(
      prompt,
      createTextModel(),
      {},
      {
        telemetry: { callId: 'call-1', stepNumber: 0, startEvent: {} },
      },
    );
    expect(result.telemetryContexts).toEqual([]);
  });

  it('captures before the model call and returns the contexts of an aborted step', async () => {
    const order: string[] = [];
    const context = {
      traceId: '1'.repeat(32),
      rootSpanId: '2'.repeat(16),
      traceFlags: 1,
      samplingDecision: 2 as const,
    };
    const onLanguageModelCallStart = vi.fn((_event: any) => {
      order.push('onLanguageModelCallStart');
    });
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
      {
        experimental_durable: {
          captureContext: (event: unknown) => {
            order.push('captureContext');
            expect(event).toEqual({ operationId: 'test', callId: 'call-1' });
            return context;
          },
        },
        onLanguageModelCallStart,
      },
    ]);
    const telemetry = {
      callId: 'call-1',
      stepNumber: 0,
      startEvent: { operationId: 'test' },
    };

    const completed = await doGenerateStep(
      prompt,
      createTextModel(),
      {},
      {
        telemetry,
      },
    );
    expect(order).toEqual(['captureContext', 'onLanguageModelCallStart']);
    expect(completed.telemetryContexts).toEqual([context]);
    // The step's own model call is reported with the captured context.
    expect(onLanguageModelCallStart.mock.calls[0][0].durableContext).toEqual(
      expect.objectContaining({ run: context, stepNumber: 0, phase: 'live' }),
    );

    const aborted = await doStreamStep(
      prompt,
      createTextModel(),
      undefined,
      {},
      { telemetry, abortSignal: AbortSignal.abort() },
    );
    expect(aborted).toEqual({
      aborted: true,
      timing: expect.anything(),
      telemetryContexts: [context],
    });
  });

  it('keeps live model tracing when an integration fails to capture', async () => {
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
      {
        experimental_durable: {
          captureContext: () => {
            throw new Error('failed');
          },
        },
      },
    ]);
    const result = await doGenerateStep(
      prompt,
      createTextModel(),
      {},
      {
        telemetry: { callId: 'call-1', stepNumber: 0, startEvent: {} },
      },
    );
    expect(result.telemetryContexts).toEqual([undefined]);
  });
});
