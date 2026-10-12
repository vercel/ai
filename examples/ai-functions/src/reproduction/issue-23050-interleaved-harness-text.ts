import type {
  HarnessV1,
  HarnessV1Metadata,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptTurnOptions,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import assert from 'node:assert/strict';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 1, reasoning: 1 },
};
const finishReason = { unified: 'stop', raw: 'stop' } as const;
const metadataA = { mock: { block: 'a' } } satisfies HarnessV1Metadata;
const metadataB = { mock: { block: 'b' } } satisfies HarnessV1Metadata;

const events: HarnessV1StreamPart[] = [
  { type: 'text-start', id: 'a', harnessMetadata: metadataA },
  { type: 'text-delta', id: 'a', delta: 'A1' },
  { type: 'text-start', id: 'b', harnessMetadata: metadataB },
  { type: 'text-delta', id: 'b', delta: 'B1' },
  { type: 'text-delta', id: 'a', delta: 'A2' },
  { type: 'text-end', id: 'a' },
  { type: 'text-end', id: 'b' },
  { type: 'finish-step', finishReason, usage },
  { type: 'finish', finishReason, totalUsage: usage },
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
          const done = Promise.resolve().then(() => {
            for (const event of events) emit(event);
          });
          return {
            done,
            async submitToolResult() {},
            async submitToolApproval() {},
          };
        },
        async doDestroy() {},
      } as unknown as Awaited<ReturnType<HarnessV1['doStart']>>;
    },
  };
}

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const files = new Map<string, string>();
  const sandboxSession = {
    id: 'synthetic',
    defaultWorkingDirectory: '/work',
    ports: [],
    async getPortEndpoint() {
      return { url: 'ws://example.test/' };
    },
    async getPortUrl() {
      return 'ws://example.test/';
    },
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
    async stop() {},
    async destroy() {},
    restricted() {
      return sandboxSession;
    },
  };
  return sandboxSession as unknown as HarnessV1NetworkSandboxSession;
}

async function main() {
  const agent = new HarnessAgent({ harness: createHarness() });
  const session = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });

  try {
    const result = await agent.stream({ session, prompt: 'Test' });
    const streamedParts = [];
    for await (const part of result.fullStream) streamedParts.push(part);

    assert.deepEqual(
      streamedParts
        .filter(part => part.type === 'text-delta')
        .map(part => part.id),
      ['a', 'b', 'a'],
      'The harness stream must preserve each text delta ID',
    );

    const textContent = (await result.finalStep).content.filter(
      part => part.type === 'text',
    );
    const failures: string[] = [];

    try {
      assert.deepEqual(
        textContent.map(part => part.text),
        ['A1A2', 'B1'],
      );
    } catch {
      failures.push(
        `text=${JSON.stringify(textContent.map(part => part.text))}`,
      );
    }

    try {
      assert.deepEqual(
        textContent.map(part => part.providerMetadata),
        [metadataA, metadataB],
      );
    } catch {
      failures.push(
        `providerMetadata=${JSON.stringify(
          textContent.map(part => part.providerMetadata),
        )}`,
      );
    }

    if (failures.length > 0) {
      console.error(
        'ISSUE_23050: finalStep.content does not preserve text blocks by ID\n' +
          failures.map(failure => `- ${failure}`).join('\n'),
      );
      process.exitCode = 1;
      return;
    }

    console.log('Issue #23050 did not reproduce.');
  } finally {
    await session.destroy();
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
