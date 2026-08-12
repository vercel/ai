import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

/*
 * Streaming tool input (Claude Code).
 *
 * A tool call's input JSON is written token by token, and a large one takes
 * long enough that a UI showing nothing until it lands looks stalled. The
 * adapter streams the input as it arrives: `tool-input-start` when the tool
 * call opens, `tool-input-delta` per fragment, `tool-input-end` when the input
 * is complete — printed below under "TOOL INPUT". The settled `tool-call`
 * still follows under the same tool call id with the parsed input, so
 * consumers that ignore these parts are unaffected.
 *
 * The prompt asks for a file whose contents are long enough that the `write`
 * tool's input takes several seconds to stream.
 */
run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({ harness: claudeCode, sandbox });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Write a file notes.md containing a 12-bullet summary of how HTTP caching works. ' +
        'Write it in one tool call; do not read anything first.',
    });

    await printFullStream({ result });

    console.log('\nfinishReason:', await result.finishReason);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
