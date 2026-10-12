import type {
  HarnessV1,
  HarnessV1NetworkSandboxSession,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { jsonSchema } from 'ai';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: 1, reasoning: 1 },
};
const finishReason = { unified: 'stop' as const, raw: 'stop' };

async function main() {
  const harness = {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    async doStart() {
      return {
        sessionId: 'mock-session',
        isResume: false,
        async doPromptTurn({
          emit,
        }: {
          emit: (event: HarnessV1StreamPart) => void;
        }) {
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
            async submitToolResult({
              toolCallId,
              output,
            }: {
              toolCallId: string;
              output: unknown;
            }) {
              if (typeof output !== 'number') {
                throw new Error(
                  'The synthetic lookup tool must return a number.',
                );
              }

              const events: HarnessV1StreamPart[] = [
                {
                  type: 'tool-result',
                  toolCallId,
                  toolName: 'lookup',
                  result: output,
                },
                {
                  type: 'finish-step',
                  finishReason: {
                    unified: 'tool-calls',
                    raw: 'tool_calls',
                  },
                  usage,
                },
                { type: 'text-start', id: 't' },
                {
                  type: 'text-delta',
                  id: 't',
                  delta: 'The answer is 42.',
                },
                { type: 'text-end', id: 't' },
                { type: 'finish-step', finishReason, usage },
                {
                  type: 'finish',
                  finishReason,
                  totalUsage: usage,
                },
              ];

              for (const event of events) {
                emit(event);
              }
              resolveDone();
            },
          };
        },
        async doDestroy() {},
      };
    },
  } as unknown as HarnessV1;

  const files = new Map<string, string>();
  const sandboxSession = {
    id: 'synthetic',
    defaultWorkingDirectory: '/work',
    ports: [],
    async run({ command }: { command: string }) {
      return {
        exitCode: 0,
        stderr: '',
        stdout:
          command === 'pwd'
            ? '/work\n'
            : command === 'printf "%s" "$HOME"'
              ? '/home/agent'
              : '',
      };
    },
    async readTextFile({ path }: { path: string }) {
      return files.get(path) ?? null;
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      files.set(path, content);
    },
    restricted() {
      return this;
    },
    async stop() {},
    async destroy() {},
  } as unknown as HarnessV1NetworkSandboxSession;

  const agent = new HarnessAgent({
    harness,
    tools: {
      lookup: {
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
        }),
        execute: async () => 42,
      },
    },
  });
  const session = await agent.createSession({ sandboxSession });

  try {
    const result = await agent.stream({ session, prompt: 'Test' });
    for await (const _part of result.fullStream) {
      // Drain the stream so all result promises settle.
    }

    const steps = await result.steps;
    if (steps.length !== 2) {
      throw new Error(
        `Expected two preserved steps, received ${steps.length}.`,
      );
    }

    const messages = await result.responseMessages;
    const observedRoles = messages.map(message => message.role);
    const expectedRoles = ['assistant', 'tool', 'assistant'];

    console.log(
      JSON.stringify(
        {
          observedRoles,
          expectedRoles,
          stepCount: steps.length,
          messages,
        },
        null,
        2,
      ),
    );

    if (JSON.stringify(observedRoles) !== JSON.stringify(expectedRoles)) {
      throw new Error(
        `ISSUE_23047_RESPONSE_MESSAGE_ORDER: expected ${JSON.stringify(expectedRoles)}, observed ${JSON.stringify(observedRoles)}`,
      );
    }
  } finally {
    await session.destroy();
  }
}

main();
