import { OpenTelemetry } from '@ai-sdk/otel';
import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentAdapterSession,
  type HarnessAgentContinueTurnOptions,
  type HarnessAgentPromptControl,
  type HarnessAgentPromptTurnOptions,
  type HarnessAgentSettings,
  type HarnessAgentStreamPart,
} from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession as SandboxSession } from 'ai';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';

type RuntimeContext = {
  conversationId: string;
};

const expectedRuntimeContext: RuntimeContext = {
  conversationId: 'conversation-21594',
};

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

function finishScript(text: string): HarnessAgentStreamPart[] {
  return [
    { type: 'stream-start', modelId: 'mock-model' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: usage,
    },
  ];
}

function createUnderlyingSession(): HarnessAgentAdapterSession {
  const emitScript = (
    options: HarnessAgentPromptTurnOptions | HarnessAgentContinueTurnOptions,
    text: string,
  ): HarnessAgentPromptControl => {
    queueMicrotask(() => {
      for (const part of finishScript(text)) {
        options.emit(part);
      }
    });

    return {
      submitToolResult: async () => {},
      done: Promise.resolve(),
    };
  };

  return {
    sessionId: 'issue-21594-session',
    isResume: false,
    doPromptTurn: async options => emitScript(options, 'prompt completed'),
    doContinueTurn: async options =>
      emitScript(options, 'continuation completed'),
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'issue-21594',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'issue-21594',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'issue-21594',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };
}

const harness = {
  specificationVersion: 'harness-v1',
  harnessId: 'issue-21594',
  builtinTools: {},
  doStart: async () => createUnderlyingSession(),
} satisfies HarnessAgentAdapter<{}>;

function createSandboxSession(): SandboxSession {
  return {
    id: 'issue-21594-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    readTextFile: async () => null,
    writeTextFile: async () => {},
    stop: async () => {},
    destroy: async () => {},
    restricted() {
      return this;
    },
  } as unknown as SandboxSession;
}

function hasExpectedContext(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value != null &&
    (value as RuntimeContext).conversationId ===
      expectedRuntimeContext.conversationId
  );
}

function withRuntimeContext<T extends object>(
  options: T,
): T & { runtimeContext: RuntimeContext } {
  return {
    ...options,
    runtimeContext: expectedRuntimeContext,
  };
}

async function main() {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const lifecycleContexts: unknown[] = [];

  // Supplying the same context at settings and call level makes the
  // reproduction compatible with either API shape proposed by the issue.
  const settings: HarnessAgentSettings<typeof harness, {}, RuntimeContext> & {
    runtimeContext: RuntimeContext;
  } = {
    harness,
    model: 'mock-model',
    runtimeContext: expectedRuntimeContext,
    telemetry: {
      isEnabled: true,
      includeRuntimeContext: { conversationId: true },
      integrations: [
        new OpenTelemetry({
          tracer: tracerProvider.getTracer('issue-21594'),
          runtimeContext: true,
        }),
      ],
    },
    onEnd: event => {
      lifecycleContexts.push(event.runtimeContext);
    },
  };
  const agent = new HarnessAgent<typeof harness, {}, RuntimeContext>(settings);

  const generateSession = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });
  const generated = await agent.generate(
    withRuntimeContext({
      session: generateSession,
      prompt: 'generate',
    }),
  );
  if (generated.text !== 'prompt completed') {
    throw new Error(`Unexpected generate result: ${generated.text}`);
  }
  await generateSession.destroy();

  const streamSession = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });
  const streamed = await agent.stream(
    withRuntimeContext({
      session: streamSession,
      prompt: 'stream',
    }),
  );
  await streamed.consumeStream();
  if ((await streamed.text) !== 'prompt completed') {
    throw new Error(`Unexpected stream result: ${await streamed.text}`);
  }
  await streamSession.destroy();

  const continueGenerateSession = await agent.createSession({
    continueFrom: {
      type: 'continue-turn',
      harnessId: 'issue-21594',
      specificationVersion: 'harness-v1',
      data: {},
    },
    sandboxSession: createSandboxSession(),
  });
  const continuedGeneration = await agent.continueGenerate(
    withRuntimeContext({
      session: continueGenerateSession,
    }),
  );
  if (continuedGeneration.text !== 'continuation completed') {
    throw new Error(
      `Unexpected continueGenerate result: ${continuedGeneration.text}`,
    );
  }
  await continueGenerateSession.destroy();

  const continueStreamSession = await agent.createSession({
    continueFrom: {
      type: 'continue-turn',
      harnessId: 'issue-21594',
      specificationVersion: 'harness-v1',
      data: {},
    },
    sandboxSession: createSandboxSession(),
  });
  const continuedStream = await agent.continueStream(
    withRuntimeContext({
      session: continueStreamSession,
    }),
  );
  await continuedStream.consumeStream();
  if ((await continuedStream.text) !== 'continuation completed') {
    throw new Error(
      `Unexpected continueStream result: ${await continuedStream.text}`,
    );
  }
  await continueStreamSession.destroy();

  await tracerProvider.forceFlush();
  const rootSpans = exporter
    .getFinishedSpans()
    .filter(span => span.name.startsWith('ai.harness '));
  const telemetryContexts = rootSpans.map(
    span => span.attributes['ai.settings.context.conversationId'],
  );

  const lifecycleContextForwarded =
    lifecycleContexts.length === 4 &&
    lifecycleContexts.every(hasExpectedContext);
  const telemetryContextForwarded =
    telemetryContexts.length === 4 &&
    telemetryContexts.every(
      value => value === expectedRuntimeContext.conversationId,
    );

  if (!lifecycleContextForwarded || !telemetryContextForwarded) {
    console.error(
      JSON.stringify(
        {
          lifecycleContexts,
          telemetryContexts,
        },
        null,
        2,
      ),
    );
    throw new Error(
      'Issue #21594 reproduced: HarnessAgent dropped runtimeContext from lifecycle callbacks and telemetry for generate, stream, continueGenerate, and continueStream',
    );
  }

  console.log(
    'HarnessAgent forwarded runtimeContext through all four public entry points.',
  );
  await tracerProvider.shutdown();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
