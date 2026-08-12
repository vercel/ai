import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

/*
 * Streaming tool input (Claude Code).
 *
 * A tool call's input JSON is written token by token, and a large one takes
 * long enough that a UI showing nothing until it lands looks stalled. The
 * adapter streams the input as it arrives: `tool-input-start` when the tool
 * call opens, `tool-input-delta` per fragment, `tool-input-end` when the input
 * is complete. The settled `tool-call` still follows, carrying the same
 * `toolCallId` and the parsed input — these parts are additive, so consumers
 * that ignore them are unaffected.
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

    for await (const chunk of result.stream) {
      switch (chunk.type) {
        case 'tool-input-start':
          process.stdout.write(
            `\n\x1b[32m\x1b[1mTOOL INPUT\x1b[22m ${chunk.toolName} (${chunk.id})\n`,
          );
          break;

        // The deltas are raw JSON fragments — they only form valid JSON once
        // the input is complete. Parse progressively (the AI SDK UI helpers do
        // this for you) rather than per delta.
        case 'tool-input-delta':
          process.stdout.write(chunk.delta);
          break;

        case 'tool-input-end':
          process.stdout.write('\x1b[0m\n');
          break;

        case 'tool-call':
          console.log(
            `\n\x1b[32m\x1b[1mTOOL CALL\x1b[22m ${chunk.toolName} (${chunk.toolCallId})\x1b[0m`,
          );
          break;

        case 'text-delta':
          process.stdout.write(chunk.text);
          break;

        case 'error':
          console.error('\n[example] stream error:', chunk.error);
          break;
      }
    }

    console.log('\nfinishReason:', await result.finishReason);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
