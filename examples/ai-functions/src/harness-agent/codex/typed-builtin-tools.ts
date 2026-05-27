import { HarnessAgent } from '@ai-sdk/harness/agent';
import { codex } from '@ai-sdk/harness-codex';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

/*
 * Codex twin of the typed-builtin-tools example. Codex's builtin tool set
 * is smaller (`bash` + `webSearch`); user tools merge cleanly. TypeScript
 * narrows `toolName` and `input` per tool across both surfaces.
 */
run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  const echo = tool({
    description: 'Return the given message back to the model.',
    inputSchema: z.object({ message: z.string() }),
    execute: async ({ message }: { message: string }) => ({ message }),
  });

  const agent = new HarnessAgent({
    harness: codex,
    sandbox,
    tools: { echo },
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Call the `echo` tool with the message "hello", then run `uname -a` and tell me the kernel.',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'tool-call' && !part.dynamic) {
        if (part.toolName === 'bash') {
          // part.input is { command: string }
          console.log(`[bash] ${part.input.command}`);
        } else if (part.toolName === 'echo') {
          // part.input is { message: string }
          console.log(`[echo] ${part.input.message}`);
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
