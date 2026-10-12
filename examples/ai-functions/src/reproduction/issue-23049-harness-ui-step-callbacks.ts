import { HarnessAgent } from '@ai-sdk/harness/agent';
import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptTurnOptions,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { jsonSchema, tool } from 'ai';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 2,
    text: 1,
    reasoning: 1,
  },
};

const finalEvents: HarnessV1StreamPart[] = [
  {
    type: 'tool-result',
    toolCallId: 'call1',
    toolName: 'lookup',
    result: 42,
  },
  {
    type: 'finish-step',
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage,
  },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: 'The answer is 42.' },
  { type: 'text-end', id: 't' },
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

function createHarness(): HarnessV1 {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    async doStart() {
      return {
        sessionId: 'mock-session',
        isResume: false,
        async doPromptTurn({ emit }: HarnessV1PromptTurnOptions) {
          let resolveDone!: () => void;
          const done = new Promise<void>(resolve => {
            resolveDone = resolve;
          });

          queueMicrotask(() => {
            emit({
              type: 'tool-call',
              toolCallId: 'call1',
              toolName: 'lookup',
              input: '{}',
            });
          });

          return {
            done,
            async submitToolApproval() {},
            async submitToolResult() {
              for (const event of finalEvents) {
                emit(event);
              }
              resolveDone();
            },
          };
        },
        async doDestroy() {},
      } as never;
    },
  };
}

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const files = new Map<string, string>();
  const sandboxSession = {
    id: 'synthetic',
    defaultWorkingDirectory: '/work',
    ports: [],
    async run({ command }: { command: string }) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: command === 'pwd' ? '/work\n' : '/home/agent',
      };
    },
    async readTextFile({ path }: { path: string }) {
      return files.get(path) ?? null;
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      files.set(path, content);
    },
    async stop() {},
    async destroy() {},
  };

  return {
    ...sandboxSession,
    restricted: () => sandboxSession,
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function createResult() {
  const agent = new HarnessAgent({
    harness: createHarness(),
    tools: {
      lookup: tool({
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => 42,
      }),
    },
  });
  const session = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });
  const result = await agent.stream({ session, prompt: 'Test' });

  return { result, session };
}

async function consumeDirectStream() {
  const { result, session } = await createResult();
  let stepCallbacks = 0;
  let endCallbacks = 0;
  let finishedSteps = 0;

  try {
    for await (const chunk of result.toUIMessageStream({
      onStepEnd: async () => {
        await Promise.resolve();
        stepCallbacks++;
      },
      onEnd: async () => {
        await Promise.resolve();
        endCallbacks++;
      },
    })) {
      if (chunk.type === 'finish-step') {
        finishedSteps++;
      }
    }
  } finally {
    await session.destroy();
  }

  return { stepCallbacks, endCallbacks, finishedSteps };
}

async function consumeResponseStream() {
  const { result, session } = await createResult();
  let stepCallbacks = 0;
  let endCallbacks = 0;

  try {
    const response = result.toUIMessageStreamResponse({
      onStepEnd: async () => {
        await Promise.resolve();
        stepCallbacks++;
      },
      onEnd: async () => {
        await Promise.resolve();
        endCallbacks++;
      },
    });
    const body = await response.text();
    const finishedSteps = body
      .split('\n')
      .filter(line => line.includes('"type":"finish-step"')).length;

    return { stepCallbacks, endCallbacks, finishedSteps };
  } finally {
    await session.destroy();
  }
}

async function consumeDirectDeprecatedAlias() {
  const { result, session } = await createResult();
  let callbacks = 0;

  try {
    for await (const _chunk of result.toUIMessageStream({
      onStepFinish: async () => {
        await Promise.resolve();
        callbacks++;
      },
    })) {
      // Consume the complete stream so all callbacks have a chance to run.
    }
  } finally {
    await session.destroy();
  }

  return callbacks;
}

async function consumeResponseDeprecatedAlias() {
  const { result, session } = await createResult();
  let callbacks = 0;

  try {
    const response = result.toUIMessageStreamResponse({
      onStepFinish: async () => {
        await Promise.resolve();
        callbacks++;
      },
    });
    await response.text();
  } finally {
    await session.destroy();
  }

  return callbacks;
}

async function consumeCallbackPrecedence() {
  const { result, session } = await createResult();
  let stepCallbacks = 0;
  let deprecatedStepCallbacks = 0;

  try {
    for await (const _chunk of result.toUIMessageStream({
      onStepEnd: async () => {
        stepCallbacks++;
      },
      onStepFinish: async () => {
        deprecatedStepCallbacks++;
      },
    })) {
      // Consume the complete stream so all callbacks have a chance to run.
    }
  } finally {
    await session.destroy();
  }

  return { stepCallbacks, deprecatedStepCallbacks };
}

async function main() {
  const direct = await consumeDirectStream();
  const response = await consumeResponseStream();
  const directDeprecated = await consumeDirectDeprecatedAlias();
  const responseDeprecated = await consumeResponseDeprecatedAlias();
  const precedence = await consumeCallbackPrecedence();

  console.log(
    JSON.stringify({
      direct,
      response,
      directDeprecated,
      responseDeprecated,
      precedence,
    }),
  );

  const controlsPassed =
    direct.finishedSteps === 2 &&
    direct.endCallbacks === 1 &&
    response.finishedSteps === 2 &&
    response.endCallbacks === 1;

  if (!controlsPassed) {
    throw new Error(
      'Reproduction control failed before evaluating UI step callbacks',
    );
  }

  const callbacksPassed =
    direct.stepCallbacks === 2 &&
    response.stepCallbacks === 2 &&
    directDeprecated === 2 &&
    responseDeprecated === 2 &&
    precedence.stepCallbacks === 2 &&
    precedence.deprecatedStepCallbacks === 0;

  if (!callbacksPassed) {
    throw new Error(
      'ISSUE_23049_REPRODUCED: HarnessAgent UI stream helpers omitted step callbacks',
    );
  }
}

await main();
