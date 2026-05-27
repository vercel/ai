import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

/*
 * Demonstrates that a HarnessAgent's `fullStream` exposes both the harness's
 * built-in tool calls (Claude Code's `Bash`/`Read`/…) and user-defined tool
 * calls under a single, fully-typed union. The `toolName` field narrows to
 * the known names; the `input` field narrows per tool to the declared
 * schema. No casts.
 */
run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  const today = tool({
    description: 'Return the current date in ISO format.',
    inputSchema: z.object({}),
    execute: async () => ({ iso: new Date().toISOString().slice(0, 10) }),
  });

  const agent = new HarnessAgent({
    harness: claudeCode,
    sandbox,
    tools: { today },
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Use the `today` tool, then create a file `notes.md` containing the date you got back.',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'tool-call' && !part.dynamic) {
        // Statically-typed call: `toolName` narrows to the union of harness
        // builtins + user tools; `input` narrows per tool to its schema.
        if (part.toolName === 'write') {
          // part.input is { file_path: string; content: string; ... }
          console.log(
            `[write] ${part.input.file_path} (${part.input.content.length} chars)`,
          );
        } else if (part.toolName === 'today') {
          console.log('[today] called');
        } else {
          console.log(`[${part.toolName}] called`);
        }
      } else if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      }
    }
    console.log();
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    process.exit(exitCode);
  }
});
