import type {
  HarnessV1,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent, HarnessAgentSession } from '@ai-sdk/harness/agent';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type CapturedTurn = {
  order: 'hook-first' | 'boundary-first';
  events: HarnessV1StreamPart[];
};

function createSession(events: HarnessV1StreamPart[]): {
  agent: HarnessAgent<HarnessV1>;
  session: HarnessAgentSession;
} {
  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-22292',
    builtinTools: {},
    doStart: async () => {
      throw new Error('not used');
    },
  };
  const runScript: HarnessV1Session['doPromptTurn'] = async options => {
    queueMicrotask(() => {
      for (const event of events) options.emit(event);
    });
    return {
      submitToolResult: async () => {},
      done: Promise.resolve(),
    };
  };
  const underlyingSession: HarnessV1Session = {
    sessionId: 'issue-22292',
    isResume: false,
    doPromptTurn: runScript,
    doContinueTurn: runScript,
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'issue-22292',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'issue-22292',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'issue-22292',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };
  return {
    agent: new HarnessAgent({ harness }),
    session: new HarnessAgentSession({
      sessionId: 'issue-22292',
      harness,
      underlyingSession,
      sandboxSession: {} as never,
      ownsSandboxLifecycle: false,
      sessionWorkDir: '/tmp/issue-22292',
      toolApproval: undefined,
    }),
  };
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected)}\nReceived: ${JSON.stringify(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  const repositoryRoot = fileURLToPath(
    new URL('../../../../', import.meta.url),
  );
  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@ai-sdk/harness-claude-code',
      'test:node',
      'src/bridge/index.test.ts',
      '-t',
      'issue 22292 captures a compaction-only turn',
    ],
    {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout.on('data', chunk => {
    const text = String(chunk);
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', chunk => {
    const text = String(chunk);
    output += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  const captures = output
    .split('\n')
    .filter(line => line.includes('ISSUE_22292_EVENTS:'))
    .map(line => {
      const markerIndex = line.indexOf('ISSUE_22292_EVENTS:');
      return JSON.parse(
        line.slice(markerIndex + 'ISSUE_22292_EVENTS:'.length),
      ) as CapturedTurn;
    });
  assertEqual(
    captures.map(capture => capture.order).sort(),
    ['boundary-first', 'hook-first'],
    'Expected bridge captures for both compaction arrival orders.',
  );

  for (const capture of captures) {
    const { agent, session } = createSession(capture.events);
    const generated = await agent.generate({ session, prompt: '/compact' });

    assertEqual(
      capture.events.map(event => event.type),
      ['stream-start', 'compaction', 'finish-step', 'finish'],
      `${capture.order} compaction-only turn did not close its synthetic step.`,
    );
    assertEqual(
      generated.dynamicToolResults.map(result => ({
        toolName: result.toolName,
        output: result.output,
        providerExecuted: result.providerExecuted,
      })),
      [
        {
          toolName: 'compaction',
          output: {
            trigger: 'manual',
            summary: 'Compacted context',
            tokensBefore: 1234,
          },
          providerExecuted: true,
        },
      ],
      `${capture.order} compaction metadata was not preserved.`,
    );
    assertEqual(
      {
        finishReason: generated.finishReason,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
      },
      { finishReason: 'stop', inputTokens: 30, outputTokens: 5 },
      `${capture.order} final result or usage was incorrect.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
