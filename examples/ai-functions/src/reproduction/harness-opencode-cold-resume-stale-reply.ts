import { readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const staleReply = 'PREVIOUS TURN ANSWER: researched cases';
const newPrompt = 'Can you write a memo with those cases?';

async function main() {
  const bridgeSourcePath = fileURLToPath(
    new URL(
      '../../../../packages/harness-opencode/src/bridge/index.ts',
      import.meta.url,
    ),
  );
  const instrumentedPath = fileURLToPath(
    new URL(
      '../../../../packages/harness-opencode/src/bridge/.issue-18933-runtime.ts',
      import.meta.url,
    ),
  );

  const source = await readFile(bridgeSourcePath, 'utf8');
  const startupStart = source.indexOf('const args = parseArgs(argv.slice(2));');
  const runTurnStart = source.indexOf('\nasync function runTurn');
  if (startupStart === -1 || runTurnStart === -1) {
    throw new Error('Could not instrument the OpenCode bridge source.');
  }

  const instrumentedSource = `${source.slice(0, startupStart)}
const workdir = '/tmp/issue-18933';
const bridgeStateDir = workdir;
const bootstrapDir = workdir;
const skillsDir = undefined;
const runtime: RuntimeState = {
  toolNames: new Set(),
  mcpToolPrefixes: new Set(),
};
${source.slice(runTurnStart)}

export { runPrompt };
`;

  await writeFile(instrumentedPath, instrumentedSource);

  const emitted: Array<Record<string, unknown>> = [];
  let submittedPrompt: string | undefined;
  let eventStreamClosed = false;
  let runError: unknown;

  try {
    const { runPrompt } = (await import(
      `${pathToFileURL(instrumentedPath).href}?t=${Date.now()}`
    )) as {
      runPrompt(input: Record<string, unknown>): Promise<unknown>;
    };

    const closedEventStream = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            eventStreamClosed = true;
            return { done: true as const, value: undefined };
          },
        };
      },
    };
    const client = {
      event: {
        subscribe: async () => ({ stream: closedEventStream }),
      },
      session: {
        get: async () => ({ data: {} }),
        promptAsync: async (request: {
          parts: Array<{ type: string; text: string }>;
        }) => {
          submittedPrompt = request.parts[0]?.text;
          return { data: {} };
        },
        messages: async () => ({
          data: [
            {
              info: {
                id: 'assistant-from-previous-turn',
                role: 'assistant',
                finish: 'stop',
              },
              parts: [{ type: 'text', id: 'stale-text', text: staleReply }],
            },
          ],
        }),
      },
      v2: {
        session: {
          context: async () => ({ data: [] }),
        },
      },
    };
    const turn = {
      abortSignal: new AbortController().signal,
      emitWarning() {},
      emitError() {},
      requestToolApproval: async () => ({ approved: true }),
      requestToolResult: async () => ({ output: undefined }),
    };

    try {
      await runPrompt({
        client,
        sessionId: 'resumed-session',
        start: {
          type: 'start',
          operation: 'prompt',
          prompt: newPrompt,
          resumeSessionId: 'resumed-session',
        },
        turn,
        emit: (event: Record<string, unknown>) => emitted.push(event),
      });
    } catch (error) {
      runError = error;
    }
  } finally {
    await unlink(instrumentedPath).catch(() => {});
  }

  const replayedPreviousReply = emitted.some(
    event => event.type === 'text-delta' && event.delta === staleReply,
  );
  const syntheticSuccess = emitted.some(event => {
    if (event.type !== 'finish-step') return false;
    const finishReason = event.finishReason as
      | { unified?: unknown }
      | undefined;
    const metadata = event.harnessMetadata as
      | { opencode?: { fallback?: unknown } }
      | undefined;
    return (
      finishReason?.unified === 'stop' && metadata?.opencode?.fallback === true
    );
  });
  const emittedToolCall = emitted.some(event => event.type === 'tool-call');

  if (submittedPrompt !== newPrompt) {
    throw new Error('The new prompt was not submitted to the resumed session.');
  }

  if (!eventStreamClosed) {
    throw new Error('The mocked OpenCode event stream did not close.');
  }

  if (replayedPreviousReply && syntheticSuccess && !emittedToolCall) {
    console.error(
      'ISSUE #18933 REPRODUCED: previous-turn assistant text was emitted as the new reply with a successful fallback finish-step.',
    );
    process.exitCode = 1;
    return;
  }

  if (replayedPreviousReply) {
    throw new Error(
      'Previous-turn assistant text was replayed without the reported successful fallback.',
    );
  }

  if (syntheticSuccess) {
    throw new Error(
      'The interrupted turn still emitted a synthetic successful fallback.',
    );
  }

  if (runError == null) {
    throw new Error(
      'The interrupted turn neither rejected nor emitted the reported stale reply.',
    );
  }

  console.log(
    'The interrupted turn rejected without emitting previous-turn assistant text.',
  );
}

await main();
