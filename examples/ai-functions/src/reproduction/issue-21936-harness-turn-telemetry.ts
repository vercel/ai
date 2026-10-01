import { OpenTelemetry } from '@ai-sdk/otel';
import {
  type HarnessV1,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import type { Telemetry } from 'ai';

const failureSignal =
  'ISSUE #21936 reproduced: failed and aborted HarnessAgent turns leave OpenTelemetry spans unexported';

function makeSandboxSession(): HarnessV1NetworkSandboxSession {
  return {
    id: 'sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    stop: async () => {},
    destroy: async () => {},
    restricted: () => ({}),
  } as unknown as HarnessV1NetworkSandboxSession;
}

function scriptedFailureHarness(script: HarnessV1StreamPart[]): HarnessV1 {
  const session: HarnessV1Session = {
    sessionId: 'telemetry-reproduction',
    isResume: false,
    doPromptTurn: async (options: HarnessV1PromptTurnOptions) => {
      const control: HarnessV1PromptControl = {
        submitToolResult: async () => {},
        done: Promise.resolve(),
      };

      queueMicrotask(() => {
        for (const event of script) {
          options.emit(event);
        }
      });

      return control;
    },
    doContinueTurn: async () => ({
      submitToolResult: async () => {},
      done: Promise.resolve(),
    }),
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    doStart: async () => session,
  };
}

async function runFailureScenario(options: {
  modelId: string;
  abortSignal?: AbortSignal;
}) {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const startEvents: unknown[] = [];
  const modelStartEvents: unknown[] = [];
  const errorEvents: unknown[] = [];
  const abortEvents: unknown[] = [];
  const recorder = {
    onStart: event => {
      startEvents.push(event);
    },
    onLanguageModelCallStart: event => {
      modelStartEvents.push(event);
    },
    onError: event => {
      errorEvents.push(event);
    },
    onAbort: event => {
      abortEvents.push(event);
    },
  } satisfies Telemetry;
  const harness = scriptedFailureHarness([
    { type: 'stream-start', modelId: options.modelId },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'partial' },
    { type: 'error', error: new Error('bridge exited') },
  ]);
  const agent = new HarnessAgent({
    harness,
    telemetry: {
      integrations: [
        new OpenTelemetry({
          tracer: provider.getTracer(`issue-21936-${options.modelId}`),
        }),
        recorder,
      ],
    },
  });
  const session = await agent.createSession({
    sandboxSession: makeSandboxSession(),
  });

  try {
    await agent.generate({
      session,
      prompt: 'go',
      abortSignal: options.abortSignal,
    });
  } catch {
    // The failed result is expected; telemetry still has to settle its spans.
  } finally {
    await session.destroy();
  }

  return {
    finishedSpanNames: exporter.getFinishedSpans().map(span => span.name),
    startEventCount: startEvents.length,
    modelStartEventCount: modelStartEvents.length,
    errorEvents,
    abortEvents,
  };
}

async function main() {
  const failedTurn = await runFailureScenario({ modelId: 'error-model' });
  const abortController = new AbortController();
  abortController.abort(new Error('user stopped'));
  const abortedTurn = await runFailureScenario({
    modelId: 'abort-model',
    abortSignal: abortController.signal,
  });

  const failedTurnHasTerminalSpans =
    failedTurn.finishedSpanNames.includes('ai.harness error-model') &&
    failedTurn.finishedSpanNames.includes('chat error-model');
  const abortedTurnHasTerminalSpans =
    abortedTurn.finishedSpanNames.includes('ai.harness abort-model') &&
    abortedTurn.finishedSpanNames.includes('chat abort-model');
  const failedTurnErrorHasCallId =
    typeof failedTurn.errorEvents[0] === 'object' &&
    failedTurn.errorEvents[0] != null &&
    'callId' in failedTurn.errorEvents[0];
  const abortWasDispatched = abortedTurn.abortEvents.length === 1;
  const setupWasObserved =
    failedTurn.startEventCount === 1 &&
    failedTurn.modelStartEventCount === 1 &&
    abortedTurn.startEventCount === 1 &&
    abortedTurn.modelStartEventCount === 1;

  if (
    setupWasObserved &&
    !failedTurnHasTerminalSpans &&
    !abortedTurnHasTerminalSpans &&
    !failedTurnErrorHasCallId &&
    !abortWasDispatched
  ) {
    console.error(failureSignal);
    console.error(
      JSON.stringify({
        failedTurn,
        abortedTurn,
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (
    setupWasObserved &&
    failedTurnHasTerminalSpans &&
    abortedTurnHasTerminalSpans &&
    failedTurnErrorHasCallId &&
    abortWasDispatched
  ) {
    console.log('Issue #21936 is not present.');
    return;
  }

  throw new Error(
    `Unexpected partial result: ${JSON.stringify({
      failedTurn,
      abortedTurn,
    })}`,
  );
}

await main();
