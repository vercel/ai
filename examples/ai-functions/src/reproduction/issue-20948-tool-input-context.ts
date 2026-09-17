import { generateText, isStepCount, streamText, tool, ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

type Hook = 'onInputStart' | 'onInputDelta' | 'onInputAvailable' | 'execute';

type RecordedEvent = {
  scenario: string;
  hook: Hook;
  context: unknown;
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function createGenerateModel() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'echo',
          input: '{"value":"hello"}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage,
      warnings: [],
    },
  });
}

function createStreamModel() {
  return new MockLanguageModelV4({
    doStream: {
      stream: convertArrayToReadableStream([
        {
          type: 'tool-input-start',
          id: 'call-1',
          toolName: 'echo',
        },
        {
          type: 'tool-input-delta',
          id: 'call-1',
          delta: '{"value":"hello"}',
        },
        {
          type: 'tool-input-end',
          id: 'call-1',
        },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'echo',
          input: '{"value":"hello"}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
          usage,
        },
      ]),
    },
  });
}

function createTools(scenario: string, events: RecordedEvent[]) {
  return {
    echo: tool({
      inputSchema: z.object({ value: z.string() }),
      contextSchema: z.object({ prefix: z.string() }),
      onInputStart: ({ context }) => {
        const prefix: string = context.prefix;
        prefix;
        events.push({ scenario, hook: 'onInputStart', context });
      },
      onInputDelta: ({ context }) => {
        const prefix: string = context.prefix;
        prefix;
        events.push({ scenario, hook: 'onInputDelta', context });
      },
      onInputAvailable: ({ context }) => {
        const prefix: string = context.prefix;
        prefix;
        events.push({ scenario, hook: 'onInputAvailable', context });
      },
      execute: async ({ value }, { context }) => {
        events.push({ scenario, hook: 'execute', context });
        return `${context.prefix}: ${value}`;
      },
    }),
  };
}

async function runGenerateText(events: RecordedEvent[]) {
  const scenario = 'generateText';
  await generateText({
    model: createGenerateModel(),
    prompt: 'Echo hello.',
    runtimeContext: { scope: 'runtime-only' },
    toolsContext: { echo: { prefix: 'tool-only' } },
    tools: createTools(scenario, events),
  });
}

async function runStreamText(events: RecordedEvent[]) {
  const scenario = 'streamText';
  const result = streamText({
    model: createStreamModel(),
    prompt: 'Echo hello.',
    runtimeContext: { scope: 'runtime-only' },
    toolsContext: { echo: { prefix: 'tool-only' } },
    tools: createTools(scenario, events),
  });
  await result.consumeStream();
}

async function runAgentGenerate(events: RecordedEvent[]) {
  const scenario = 'ToolLoopAgent.generate';
  const agent = new ToolLoopAgent({
    model: createGenerateModel(),
    runtimeContext: { scope: 'runtime-only' },
    toolsContext: { echo: { prefix: 'tool-only' } },
    tools: createTools(scenario, events),
    stopWhen: isStepCount(1),
  });
  await agent.generate({ prompt: 'Echo hello.' });
}

async function runAgentStream(events: RecordedEvent[]) {
  const scenario = 'ToolLoopAgent.stream';
  const agent = new ToolLoopAgent({
    model: createStreamModel(),
    runtimeContext: { scope: 'runtime-only' },
    toolsContext: { echo: { prefix: 'tool-only' } },
    tools: createTools(scenario, events),
    stopWhen: isStepCount(1),
  });
  const result = await agent.stream({ prompt: 'Echo hello.' });
  await result.consumeStream();
}

async function runGenerateTextWithStepOverride(events: RecordedEvent[]) {
  const scenario = 'generateText prepareStep override';
  await generateText({
    model: createGenerateModel(),
    prompt: 'Echo hello.',
    runtimeContext: { scope: 'runtime-only' },
    toolsContext: { echo: { prefix: 'initial-only' } },
    tools: createTools(scenario, events),
    prepareStep: () => ({
      toolsContext: { echo: { prefix: 'step-only' } },
    }),
  });
}

async function runStreamTextWithStepOverride(events: RecordedEvent[]) {
  const scenario = 'streamText prepareStep override';
  const result = streamText({
    model: createStreamModel(),
    prompt: 'Echo hello.',
    runtimeContext: { scope: 'runtime-only' },
    toolsContext: { echo: { prefix: 'initial-only' } },
    tools: createTools(scenario, events),
    prepareStep: () => ({
      toolsContext: { echo: { prefix: 'step-only' } },
    }),
  });
  await result.consumeStream();
}

function contextValue(context: unknown, key: string): unknown {
  return typeof context === 'object' && context != null && key in context
    ? (context as Record<string, unknown>)[key]
    : undefined;
}

async function main() {
  const events: RecordedEvent[] = [];

  await runGenerateText(events);
  await runStreamText(events);
  await runAgentGenerate(events);
  await runAgentStream(events);
  await runGenerateTextWithStepOverride(events);
  await runStreamTextWithStepOverride(events);

  const expected = [
    {
      scenario: 'generateText',
      hooks: ['onInputStart', 'onInputAvailable', 'execute'] as const,
      prefix: 'tool-only',
    },
    {
      scenario: 'streamText',
      hooks: [
        'onInputStart',
        'onInputDelta',
        'onInputAvailable',
        'execute',
      ] as const,
      prefix: 'tool-only',
    },
    {
      scenario: 'ToolLoopAgent.generate',
      hooks: ['onInputStart', 'onInputAvailable', 'execute'] as const,
      prefix: 'tool-only',
    },
    {
      scenario: 'ToolLoopAgent.stream',
      hooks: [
        'onInputStart',
        'onInputDelta',
        'onInputAvailable',
        'execute',
      ] as const,
      prefix: 'tool-only',
    },
    {
      scenario: 'generateText prepareStep override',
      hooks: ['onInputStart', 'onInputAvailable', 'execute'] as const,
      prefix: 'step-only',
    },
    {
      scenario: 'streamText prepareStep override',
      hooks: [
        'onInputStart',
        'onInputDelta',
        'onInputAvailable',
        'execute',
      ] as const,
      prefix: 'step-only',
    },
  ];

  const missing: Array<{ scenario: string; hook: Hook }> = [];
  const wrongExecuteContexts: RecordedEvent[] = [];
  const wrongCallbackContexts: RecordedEvent[] = [];

  for (const expectation of expected) {
    for (const hook of expectation.hooks) {
      const event = events.find(
        event => event.scenario === expectation.scenario && event.hook === hook,
      );

      if (event == null) {
        missing.push({ scenario: expectation.scenario, hook });
      } else if (contextValue(event.context, 'prefix') !== expectation.prefix) {
        if (hook === 'execute') {
          wrongExecuteContexts.push(event);
        } else {
          wrongCallbackContexts.push(event);
        }
      }
    }
  }

  if (missing.length > 0 || wrongExecuteContexts.length > 0) {
    throw new Error(
      `Reproduction setup failed: ${JSON.stringify({
        missing,
        wrongExecuteContexts,
      })}`,
    );
  }

  if (wrongCallbackContexts.length === 0) {
    console.log(
      'Issue #20948 not reproduced: every tool input callback received its tool context.',
    );
    return;
  }

  const allReceivedRuntimeContext = wrongCallbackContexts.every(
    event =>
      contextValue(event.context, 'scope') === 'runtime-only' &&
      contextValue(event.context, 'prefix') === undefined,
  );

  if (!allReceivedRuntimeContext) {
    throw new Error(
      `Unexpected callback contexts: ${JSON.stringify(wrongCallbackContexts)}`,
    );
  }

  console.error(
    'ISSUE_20948_REPRODUCED: tool input callbacks received runtimeContext instead of tool context',
  );
  console.error(JSON.stringify(wrongCallbackContexts, null, 2));
  process.exitCode = 1;
}

main().catch(error => {
  console.error('ISSUE_20948_REPRODUCTION_SETUP_FAILED');
  console.error(error);
  process.exitCode = 2;
});
