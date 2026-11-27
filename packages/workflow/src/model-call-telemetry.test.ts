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
      const runFirstModelStep = (
        telemetry: NonNullable<
          Parameters<typeof doGenerateStep>[3]
        >['telemetry'],
      ) => doGenerateStep(prompt, firstStepModel, {}, { telemetry });
      const firstStepModel = new MockLanguageModelV4({
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
      });
      // The first model step captures the contexts from the start event.
      let result = await runFirstModelStep({
        callId: recorder.callId,
        stepNumber: 0,
        startEvent: structuredClone(getRecordedStartEvent(recorder.events)),
      });
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
      if (mode !== 'legacy') {
        // A durable context is returned before the model is called, so it is
        // persisted before a model call is reported with it.
        expect(result).toEqual({
          aborted: true,
          deferred: true,
          telemetryContexts: recorder.contexts,
        });
        expect(activeModelContext).toBeUndefined();
        expect(exporter.getFinishedSpans()).toEqual([]);
        result = await runFirstModelStep({
          callId: recorder.callId,
          stepNumber: 0,
          contexts: recorder.contexts,
        });
        expect(result).not.toHaveProperty('telemetryContexts');
      }
      expect(captureContext).toHaveBeenCalledOnce();
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

  it('returns a durable context without calling the model', async () => {
    const context = {
      traceId: '1'.repeat(32),
      rootSpanId: '2'.repeat(16),
      traceFlags: 1,
      samplingDecision: 2 as const,
    };
    const captureContext = vi.fn((_event: unknown) => context);
    const onLanguageModelCallStart = vi.fn((_event: any) => {});
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
      { experimental_durable: { captureContext }, onLanguageModelCallStart },
    ]);
    const model = createTextModel();
    const telemetry = {
      callId: 'call-1',
      stepNumber: 0,
      startEvent: { operationId: 'test' },
    };

    for (const deferred of [
      await doGenerateStep(prompt, model, {}, { telemetry }),
      await doStreamStep(prompt, model, undefined, {}, { telemetry }),
    ]) {
      expect(deferred).toEqual({
        aborted: true,
        deferred: true,
        telemetryContexts: [context],
      });
    }
    expect(captureContext).toHaveBeenCalledWith({
      operationId: 'test',
      callId: 'call-1',
    });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(model.doStreamCalls).toHaveLength(0);
    expect(onLanguageModelCallStart).not.toHaveBeenCalled();

    // The workflow runs the model step again with the returned contexts.
    const completed = await doGenerateStep(
      prompt,
      model,
      {},
      {
        telemetry: { callId: 'call-1', stepNumber: 0, contexts: [context] },
      },
    );
    expect(completed).not.toHaveProperty('telemetryContexts');
    expect(model.doGenerateCalls).toHaveLength(1);
    // Only the two deferred steps above captured.
    expect(captureContext).toHaveBeenCalledTimes(2);
    expect(onLanguageModelCallStart.mock.calls[0][0].durableContext).toEqual(
      expect.objectContaining({ run: context, stepNumber: 0, phase: 'live' }),
    );
  });

  it('calls the model in the capturing step when no context is durable', async () => {
    const order: string[] = [];
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
      // An integration with a bridge that cannot capture a context.
      {
        experimental_durable: {
          captureContext: () => void order.push('captureContext'),
        },
        onLanguageModelCallStart: () =>
          void order.push('onLanguageModelCallStart'),
      },
      { onEnd: () => {} },
    ]);
    const telemetry = { callId: 'call-1', stepNumber: 0, startEvent: {} };

    const completed = await doGenerateStep(
      prompt,
      createTextModel(),
      {},
      {
        telemetry,
      },
    );
    expect(order).toEqual(['captureContext', 'onLanguageModelCallStart']);
    expect(completed.aborted).not.toBe(true);
    expect(completed.telemetryContexts).toEqual([undefined, undefined]);

    // A step that does not call the model still returns what it captured.
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
      telemetryContexts: [undefined, undefined],
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
